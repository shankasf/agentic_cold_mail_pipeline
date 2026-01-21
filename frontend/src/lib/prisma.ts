import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/**
 * Prisma Client singleton with connection pooling.
 *
 * Connection pooling is configured via DATABASE_URL query parameters:
 * - connection_limit: Max connections (default: 10, recommend: 20 for production)
 * - pool_timeout: How long to wait for a connection (default: 10s)
 *
 * Example DATABASE_URL with pooling:
 * postgresql://user:pass@host:5432/db?connection_limit=20&pool_timeout=10
 *
 * For serverless environments, consider using Prisma Accelerate or PgBouncer.
 */
const prisma =
  global.prisma ??
  new PrismaClient({
    // Only log errors in production for performance
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

// Store in global to prevent multiple instances in both dev and prod
global.prisma = prisma;

export { prisma };
export default prisma;
