import { NextRequest } from 'next/server';
import { getRedisSub, EMAIL_GENERATION_CHANNEL_PREFIX } from '@/lib/redis';

export const dynamic = 'force-dynamic';

// GET /api/campaigns/[id]/leads/generate-emails/stream?jobId=xxx
// SSE endpoint for streaming email generation progress
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');

  if (!jobId) {
    return new Response('Missing jobId parameter', { status: 400 });
  }

  const channel = `${EMAIL_GENERATION_CHANNEL_PREFIX}${jobId}`;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const redisSub = getRedisSub();

      // Send initial connection message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected', jobId, timestamp: Date.now() })}\n\n`)
      );

      // Subscribe to the job's channel
      await redisSub.subscribe(channel);

      // Handle messages
      const messageHandler = (ch: string, message: string) => {
        if (ch === channel) {
          try {
            const data = JSON.parse(message);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

            // Close stream on complete, error, or cancelled
            if (['complete', 'error', 'cancelled'].includes(data.type)) {
              setTimeout(() => {
                try {
                  redisSub.unsubscribe(channel);
                  controller.close();
                } catch {
                  // Ignore errors on cleanup
                }
              }, 1000);
            }
          } catch (e) {
            console.error('Error processing message:', e);
          }
        }
      };

      redisSub.on('message', messageHandler);

      // Heartbeat to keep connection alive
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`)
          );
        } catch {
          clearInterval(heartbeatInterval);
        }
      }, 15000);

      // Cleanup on abort
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeatInterval);
        redisSub.unsubscribe(channel);
        try {
          controller.close();
        } catch {
          // Ignore close errors
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
    },
  });
}
