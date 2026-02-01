import { NextRequest, NextResponse } from 'next/server';
import { getSystemHealth, getSimpleHealth, isReady, isAlive } from '@/lib/health';
import { createApiHandler, jsonResponse } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health - Deep health check
 * Returns comprehensive health status for monitoring
 *
 * Query params:
 * - type=full (default): Complete health check with all components
 * - type=simple: Fast check for load balancers
 * - type=ready: Kubernetes readiness probe
 * - type=live: Kubernetes liveness probe
 */
export const GET = createApiHandler(
  async (request: NextRequest, { logger }) => {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'full';

    switch (type) {
      case 'simple':
        // Fast check for load balancers
        const simple = await getSimpleHealth();
        logger.debug('Simple health check', { status: simple.status });
        return jsonResponse(simple, {
          status: simple.status === 'ok' ? 200 : 503,
        });

      case 'ready':
        // Kubernetes readiness probe
        const ready = await isReady();
        logger.debug('Readiness check', { ready });
        return jsonResponse(
          { ready, timestamp: new Date().toISOString() },
          { status: ready ? 200 : 503 }
        );

      case 'live':
        // Kubernetes liveness probe
        const alive = isAlive();
        logger.debug('Liveness check', { alive });
        return jsonResponse(
          { alive, timestamp: new Date().toISOString() },
          { status: alive ? 200 : 503 }
        );

      case 'full':
      default:
        // Full health check with all components
        const health = await getSystemHealth();
        logger.info('Full health check', {
          status: health.status,
          score: health.score,
        });
        const httpStatus = health.status === 'unhealthy' ? 503 : 200;
        return jsonResponse(health, { status: httpStatus });
    }
  },
  { requireAuth: false }  // Health checks should be public for monitoring
);
