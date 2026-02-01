/**
 * Deep Health Check System
 *
 * Provides comprehensive health status for all system components:
 * - Database connectivity and latency
 * - Redis connectivity and latency
 * - OpenAI API availability
 * - SES service status
 * - Queue worker status
 */

import { logger } from './logger';
import prisma from './prisma';
import { redis as getRedis } from './redis';
import { getCircuitBreakerStatus, CircuitState } from './circuit-breaker';
import { QUEUE_NAMES } from './queue';

// Component health status
export type ComponentStatus = 'healthy' | 'degraded' | 'unhealthy';

// Individual component health
export interface ComponentHealth {
  status: ComponentStatus;
  latency_ms?: number;
  message?: string;
  lastCheck?: Date;
  metadata?: Record<string, unknown>;
}

// Overall system health
export interface SystemHealth {
  status: ComponentStatus;
  score: number;  // 0-100
  timestamp: string;
  components: {
    database: ComponentHealth;
    redis: ComponentHealth;
    openai: ComponentHealth;
    ses: ComponentHealth;
    queue: ComponentHealth;
  };
  uptime_seconds: number;
}

// Track service start time
const serviceStartTime = Date.now();

/**
 * Calculate health score from component statuses
 */
function calculateHealthScore(components: Record<string, ComponentHealth>): number {
  const weights: Record<string, number> = {
    database: 30,
    redis: 25,
    ses: 20,
    openai: 15,
    queue: 10,
  };

  let totalWeight = 0;
  let weightedScore = 0;

  for (const [component, health] of Object.entries(components)) {
    const weight = weights[component] || 10;
    totalWeight += weight;

    switch (health.status) {
      case 'healthy':
        weightedScore += weight;
        break;
      case 'degraded':
        weightedScore += weight * 0.5;
        break;
      case 'unhealthy':
        weightedScore += 0;
        break;
    }
  }

  return Math.round((weightedScore / totalWeight) * 100);
}

/**
 * Determine overall status from component statuses
 */
function determineOverallStatus(components: Record<string, ComponentHealth>): ComponentStatus {
  const statuses = Object.values(components).map(c => c.status);

  if (statuses.includes('unhealthy')) {
    // Check if critical components are unhealthy
    if (components.database?.status === 'unhealthy' || components.redis?.status === 'unhealthy') {
      return 'unhealthy';
    }
    return 'degraded';
  }

  if (statuses.includes('degraded')) {
    return 'degraded';
  }

  return 'healthy';
}

/**
 * Check database health
 */
async function checkDatabase(): Promise<ComponentHealth> {
  const start = Date.now();

  try {
    // Simple query to test connectivity
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;

    if (latency > 1000) {
      return {
        status: 'degraded',
        latency_ms: latency,
        message: 'High latency detected',
        lastCheck: new Date(),
      };
    }

    return {
      status: 'healthy',
      latency_ms: latency,
      lastCheck: new Date(),
    };
  } catch (error) {
    logger.error('Database health check failed', error);
    return {
      status: 'unhealthy',
      latency_ms: Date.now() - start,
      message: error instanceof Error ? error.message : 'Connection failed',
      lastCheck: new Date(),
    };
  }
}

/**
 * Check Redis health
 */
async function checkRedis(): Promise<ComponentHealth> {
  const start = Date.now();

  try {
    const redis = getRedis();
    await redis.ping();
    const latency = Date.now() - start;

    // Get some Redis stats
    const info = await redis.info('memory');
    const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
    const usedMemory = memoryMatch ? memoryMatch[1] : 'unknown';

    if (latency > 500) {
      return {
        status: 'degraded',
        latency_ms: latency,
        message: 'High latency detected',
        lastCheck: new Date(),
        metadata: { usedMemory },
      };
    }

    return {
      status: 'healthy',
      latency_ms: latency,
      lastCheck: new Date(),
      metadata: { usedMemory },
    };
  } catch (error) {
    logger.error('Redis health check failed', error);
    return {
      status: 'unhealthy',
      latency_ms: Date.now() - start,
      message: error instanceof Error ? error.message : 'Connection failed',
      lastCheck: new Date(),
    };
  }
}

/**
 * Check OpenAI service health via circuit breaker
 */
async function checkOpenAI(): Promise<ComponentHealth> {
  const cbStatus = getCircuitBreakerStatus();
  const openaiStatus = cbStatus.openai;

  if (!openaiStatus) {
    return {
      status: 'healthy',
      message: 'Circuit breaker not initialized',
      lastCheck: new Date(),
    };
  }

  if (openaiStatus.state === CircuitState.OPEN) {
    return {
      status: 'unhealthy',
      message: `Circuit breaker OPEN - ${openaiStatus.stats.failedCalls} failures`,
      lastCheck: new Date(),
      metadata: {
        failureCount: openaiStatus.failureCount,
        timeUntilRetry: openaiStatus.timeUntilRetry,
      },
    };
  }

  if (openaiStatus.state === CircuitState.HALF_OPEN) {
    return {
      status: 'degraded',
      message: 'Circuit breaker in recovery mode',
      lastCheck: new Date(),
      metadata: {
        successCount: openaiStatus.successCount,
      },
    };
  }

  return {
    status: 'healthy',
    lastCheck: new Date(),
    metadata: {
      totalCalls: openaiStatus.stats.totalCalls,
      successRate: openaiStatus.stats.totalCalls > 0
        ? (openaiStatus.stats.successfulCalls / openaiStatus.stats.totalCalls * 100).toFixed(1) + '%'
        : 'N/A',
    },
  };
}

/**
 * Check SES service health via circuit breaker
 */
async function checkSES(): Promise<ComponentHealth> {
  const cbStatus = getCircuitBreakerStatus();
  const sesStatus = cbStatus.ses;

  if (!sesStatus) {
    return {
      status: 'healthy',
      message: 'Circuit breaker not initialized',
      lastCheck: new Date(),
    };
  }

  if (sesStatus.state === CircuitState.OPEN) {
    return {
      status: 'unhealthy',
      message: `Circuit breaker OPEN - ${sesStatus.stats.failedCalls} failures`,
      lastCheck: new Date(),
      metadata: {
        failureCount: sesStatus.failureCount,
        timeUntilRetry: sesStatus.timeUntilRetry,
      },
    };
  }

  if (sesStatus.state === CircuitState.HALF_OPEN) {
    return {
      status: 'degraded',
      message: 'Circuit breaker in recovery mode',
      lastCheck: new Date(),
    };
  }

  // Also check sending quota
  try {
    const identities = await prisma.sESIdentity.findMany({
      where: { status: { in: ['VERIFIED', 'ACTIVE', 'WARMING'] } },
    });

    const totalRemaining = identities.reduce(
      (sum, i) => sum + Math.max(0, i.dailyLimit - i.sentToday),
      0
    );

    if (totalRemaining === 0) {
      return {
        status: 'degraded',
        message: 'All sending identities at daily limit',
        lastCheck: new Date(),
        metadata: {
          identityCount: identities.length,
          totalRemaining: 0,
        },
      };
    }

    return {
      status: 'healthy',
      lastCheck: new Date(),
      metadata: {
        identityCount: identities.length,
        totalRemaining,
      },
    };
  } catch (error) {
    return {
      status: 'healthy',
      message: 'Could not check quota',
      lastCheck: new Date(),
    };
  }
}

/**
 * Check queue health
 */
async function checkQueue(): Promise<ComponentHealth> {
  try {
    const redis = getRedis();

    // Check queue depths
    const waitingCount = await redis.llen(`bull:${QUEUE_NAMES.EMAIL_SEND}:wait`);
    const activeCount = await redis.llen(`bull:${QUEUE_NAMES.EMAIL_SEND}:active`);
    const failedCount = await redis.llen(`bull:${QUEUE_NAMES.EMAIL_SEND}:failed`);

    if (failedCount > 100) {
      return {
        status: 'degraded',
        message: `High failed job count: ${failedCount}`,
        lastCheck: new Date(),
        metadata: {
          waiting: waitingCount,
          active: activeCount,
          failed: failedCount,
        },
      };
    }

    if (waitingCount > 5000) {
      return {
        status: 'degraded',
        message: `High queue depth: ${waitingCount}`,
        lastCheck: new Date(),
        metadata: {
          waiting: waitingCount,
          active: activeCount,
          failed: failedCount,
        },
      };
    }

    return {
      status: 'healthy',
      lastCheck: new Date(),
      metadata: {
        waiting: waitingCount,
        active: activeCount,
        failed: failedCount,
      },
    };
  } catch (error) {
    logger.error('Queue health check failed', error);
    return {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Check failed',
      lastCheck: new Date(),
    };
  }
}

/**
 * Run comprehensive health check
 */
export async function getSystemHealth(): Promise<SystemHealth> {
  const [database, redis, openai, ses, queue] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkOpenAI(),
    checkSES(),
    checkQueue(),
  ]);

  const components = { database, redis, openai, ses, queue };
  const score = calculateHealthScore(components);
  const status = determineOverallStatus(components);

  return {
    status,
    score,
    timestamp: new Date().toISOString(),
    components,
    uptime_seconds: Math.floor((Date.now() - serviceStartTime) / 1000),
  };
}

/**
 * Simple health check for load balancers (fast)
 */
export async function getSimpleHealth(): Promise<{
  status: 'ok' | 'error';
  timestamp: string;
}> {
  try {
    // Just check database connectivity
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  } catch {
    return {
      status: 'error',
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Check if system is ready to accept traffic
 */
export async function isReady(): Promise<boolean> {
  try {
    const health = await getSystemHealth();
    // Ready if score is above 50 and database is not unhealthy
    return health.score >= 50 && health.components.database.status !== 'unhealthy';
  } catch {
    return false;
  }
}

/**
 * Check if system is alive
 */
export function isAlive(): boolean {
  // Simple liveness check - service is running
  return true;
}
