import { NextRequest } from 'next/server';
import { getRedisSub, EMAIL_GENERATION_CHANNEL_PREFIX } from '@/lib/redis';
import { Logger, generateRequestId } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// GET /api/businesses/generate-emails/[jobId]/stream - SSE endpoint for job progress
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const requestId = generateRequestId();
  const logger = new Logger({
    requestId,
    endpoint: `/api/businesses/generate-emails/${jobId}/stream`,
    method: 'GET',
  });

  logger.info('SSE connection initiated for job', { jobId });

  const encoder = new TextEncoder();
  const channel = `${EMAIL_GENERATION_CHANNEL_PREFIX}${jobId}`;

  const stream = new ReadableStream({
    async start(controller) {
      const redisSub = getRedisSub();

      // Send initial connection message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected', jobId, timestamp: Date.now() })}\n\n`)
      );

      // Subscribe to job-specific channel
      const messageHandler = (message: string, ch: string) => {
        if (ch === channel) {
          try {
            controller.enqueue(encoder.encode(`data: ${message}\n\n`));

            // Check if job is done
            const data = JSON.parse(message);
            if (data.type === 'completed' || data.type === 'cancelled' || data.type === 'error') {
              // Clean up after a short delay
              setTimeout(async () => {
                try {
                  redisSub.off('message', messageHandler);
                  await redisSub.unsubscribe(channel);
                  controller.close();
                } catch {
                  // Already closed
                }
              }, 1000);
            }
          } catch (e) {
            logger.error('Error parsing job progress', e);
          }
        }
      };

      await redisSub.subscribe(channel);
      redisSub.on('message', messageHandler);

      logger.debug('Subscribed to job channel', { channel });

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

      // Cleanup on connection close
      request.signal.addEventListener('abort', async () => {
        logger.info('SSE connection closed for job', { jobId });
        clearInterval(heartbeatInterval);
        redisSub.off('message', messageHandler);
        await redisSub.unsubscribe(channel);
        try {
          controller.close();
        } catch {
          // Already closed
        }
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
