import { prisma } from '@/lib/prisma';
import { createApiHandler, jsonResponse } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(async (_request, { logger }) => {
  const healthCheck = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: 'unknown' as string,
    },
  };

  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    healthCheck.checks.database = 'ok';
    logger.debug('Health check - database ok');
  } catch (error) {
    healthCheck.status = 'degraded';
    healthCheck.checks.database = 'error';
    logger.error('Health check - database error', error as Error);
  }

  const statusCode = healthCheck.status === 'ok' ? 200 : 503;

  return jsonResponse(healthCheck, { status: statusCode });
});
