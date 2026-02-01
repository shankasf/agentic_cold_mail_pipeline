import { NextRequest } from 'next/server';
import { getRedisSub, redis as getRedis } from '@/lib/redis';
import { Logger, generateRequestId } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// Channel for all service logs
const LOGS_CHANNEL = 'service:logs';
const LOGS_HISTORY_KEY = 'service:logs:history';

interface LogEntry {
  timestamp: string;
  service: string;
  level: 'info' | 'error' | 'warn' | 'debug';
  message: string;
  metadata?: Record<string, unknown>;
  agent?: string;
  tool?: string;
}

// GET /api/logs/stream - SSE endpoint for real-time logs via Redis pub/sub
export async function GET(request: NextRequest) {
  const requestId = generateRequestId();
  const logger = new Logger({
    requestId,
    endpoint: '/api/logs/stream',
    method: 'GET',
  });

  const searchParams = request.nextUrl.searchParams;
  const services = searchParams.get('services')?.split(',') || ['frontend', 'ai', 'redis', 'postgres'];
  const levels = searchParams.get('levels')?.split(',') || ['info', 'error', 'warn', 'debug'];

  logger.info('Logs stream initiated', { services, levels });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const redisSub = getRedisSub();
      const redis = getRedis();

      // Send initial connection message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({
          type: 'connected',
          services,
          timestamp: Date.now()
        })}\n\n`)
      );

      // Fetch and send historical logs first
      try {
        const historyLogs = await redis.lrange(LOGS_HISTORY_KEY, 0, 499);
        // Reverse to get chronological order (oldest first)
        const chronologicalLogs = historyLogs.reverse();

        for (const logStr of chronologicalLogs) {
          try {
            const log = JSON.parse(logStr) as LogEntry;

            // Filter by service
            const logService = log.service?.replace('-service', '') || 'frontend';
            if (!services.some(s => logService.includes(s) || s.includes(logService))) {
              continue;
            }

            // Filter by level
            if (!levels.includes(log.level)) {
              continue;
            }

            controller.enqueue(encoder.encode(`data: ${logStr}\n\n`));
          } catch {
            // Skip invalid logs
          }
        }

        logger.debug(`Sent ${chronologicalLogs.length} historical logs`);
      } catch (e) {
        logger.warn('Failed to fetch log history', { error: String(e) });
      }

      // Subscribe to logs channel
      const messageHandler = (message: string, channel: string) => {
        if (channel === LOGS_CHANNEL) {
          try {
            const log = JSON.parse(message) as LogEntry;

            // Filter by service
            const logService = log.service?.replace('-service', '') || 'frontend';
            if (!services.some(s => logService.includes(s) || s.includes(logService))) {
              return;
            }

            // Filter by level
            if (!levels.includes(log.level)) {
              return;
            }

            controller.enqueue(encoder.encode(`data: ${message}\n\n`));
          } catch (e) {
            // If not JSON, create a basic log entry
            const entry: LogEntry = {
              timestamp: new Date().toISOString(),
              service: 'frontend',
              level: 'info',
              message: message,
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(entry)}\n\n`));
          }
        }
      };

      await redisSub.subscribe(LOGS_CHANNEL);
      redisSub.on('message', messageHandler);

      logger.debug('Subscribed to logs channel');

      // Send heartbeat every 15 seconds
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`)
          );
        } catch {
          clearInterval(heartbeatInterval);
        }
      }, 15000);

      // Cleanup on close
      request.signal.addEventListener('abort', async () => {
        logger.info('Logs stream closed');
        clearInterval(heartbeatInterval);
        redisSub.off('message', messageHandler);
        await redisSub.unsubscribe(LOGS_CHANNEL);
        try {
          controller.close();
        } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Request-Id': requestId,
    },
  });
}
