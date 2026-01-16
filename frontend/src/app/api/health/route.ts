import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const healthCheck = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: 'unknown',
    },
  };

  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    healthCheck.checks.database = 'ok';
  } catch (error) {
    healthCheck.status = 'degraded';
    healthCheck.checks.database = 'error';
    console.error('Health check - Database error:', error);
  }

  const statusCode = healthCheck.status === 'ok' ? 200 : 503;

  return NextResponse.json(healthCheck, { status: statusCode });
}
