import type { Redis as RedisType } from 'ioredis';

declare global {
  // eslint-disable-next-line no-var
  var redis: RedisType | undefined;
  // eslint-disable-next-line no-var
  var redisPub: RedisType | undefined;
  // eslint-disable-next-line no-var
  var redisSub: RedisType | undefined;
}

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Lazy initialization to prevent build-time connection
function getRedis(): RedisType {
  if (!global.redis) {
    const Redis = require('ioredis').default;
    global.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });
  }
  return global.redis!;
}

function getRedisPub(): RedisType {
  if (!global.redisPub) {
    const Redis = require('ioredis').default;
    global.redisPub = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });
  }
  return global.redisPub!;
}

function getRedisSub(): RedisType {
  if (!global.redisSub) {
    const Redis = require('ioredis').default;
    global.redisSub = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });
  }
  return global.redisSub!;
}

// Export getters for lazy access
export { getRedis as redis, getRedisPub as redisPub, getRedisSub as redisSub };

// Channel for upload progress updates
export const UPLOAD_PROGRESS_CHANNEL = 'upload:progress';

// Publish upload progress
export async function publishUploadProgress(uploadId: string, progress: string) {
  await getRedisPub().publish(
    UPLOAD_PROGRESS_CHANNEL,
    JSON.stringify({ uploadId, progress, timestamp: Date.now() })
  );
}

// =============================================================================
// CACHING UTILITIES
// =============================================================================

// Cache TTLs in seconds
export const CACHE_TTL = {
  ANALYTICS: 300,      // 5 minutes
  BUSINESSES: 60,      // 1 minute
  EMAILS: 60,          // 1 minute
  TEMPLATES: 300,      // 5 minutes
  INDUSTRY_LIST: 600,  // 10 minutes
} as const;

// Get cached data
export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const cached = await getRedis().get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }
    return null;
  } catch {
    return null;
  }
}

// Set cached data with TTL
export async function setCache<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
  try {
    await getRedis().setex(key, ttlSeconds, JSON.stringify(data));
  } catch {
    // Silently fail - caching is optional
  }
}

// Delete cached data
export async function deleteCache(key: string): Promise<void> {
  try {
    await getRedis().del(key);
  } catch {
    // Silently fail
  }
}

// Delete cached data by pattern
export async function deleteCachePattern(pattern: string): Promise<void> {
  try {
    const keys = await getRedis().keys(pattern);
    if (keys.length > 0) {
      await getRedis().del(...keys);
    }
  } catch {
    // Silently fail
  }
}

// Cache key generators
export const cacheKey = {
  analytics: (timeRange: string) => `cache:analytics:${timeRange}`,
  businesses: (params: string) => `cache:businesses:${params}`,
  emails: (params: string) => `cache:emails:${params}`,
  templates: () => 'cache:templates',
  industries: () => 'cache:industries',
} as const;

export default getRedis;
