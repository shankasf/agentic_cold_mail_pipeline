import { NextRequest } from 'next/server';
import { getRedisSub, EMAIL_EVENTS_CHANNEL } from '@/lib/redis';
import { Logger, generateRequestId } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// GET /api/emails/events/stream - SSE endpoint for real-time email event updates
export async function GET(request: NextRequest) {
  const requestId = generateRequestId();
  const logger = new Logger({
    requestId,
    endpoint: '/api/emails/events/stream',
    method: 'GET',
  });

  logger.info('SSE connection initiated');

  const encoder = new TextEncoder();

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const redisSub = getRedisSub();

      // Send initial connection message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`)
      );

      // Subscribe to email events channel
      const messageHandler = (message: string, channel: string) => {
        if (channel === EMAIL_EVENTS_CHANNEL) {
          try {
            const event = JSON.parse(message);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            );
          } catch (e) {
            logger.error('Error parsing email event', e);
          }
        }
      };

      await redisSub.subscribe(EMAIL_EVENTS_CHANNEL);
      redisSub.on('message', messageHandler);

      logger.debug('Subscribed to email events channel');

      // Send heartbeat every 30 seconds to keep connection alive
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`)
          );
        } catch {
          // Connection closed
          clearInterval(heartbeatInterval);
        }
      }, 30000);

      // Cleanup on connection close
      request.signal.addEventListener('abort', async () => {
        logger.info('SSE connection closed');
        clearInterval(heartbeatInterval);
        redisSub.off('message', messageHandler);
        await redisSub.unsubscribe(EMAIL_EVENTS_CHANNEL);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
      'X-Request-Id': requestId,
    },
  });
}
