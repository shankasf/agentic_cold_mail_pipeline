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

// Channel for email event updates
export const EMAIL_EVENTS_CHANNEL = 'email:events';

// Channel for email generation progress (per job)
export const EMAIL_GENERATION_CHANNEL_PREFIX = 'email:generation:';

// Publish upload progress
export async function publishUploadProgress(uploadId: string, progress: string) {
  await getRedisPub().publish(
    UPLOAD_PROGRESS_CHANNEL,
    JSON.stringify({ uploadId, progress, timestamp: Date.now() })
  );
}

// Publish email event for real-time updates
export async function publishEmailEvent(
  emailId: string,
  eventType: string,
  contactEmail: string,
  businessName?: string
) {
  await getRedisPub().publish(
    EMAIL_EVENTS_CHANNEL,
    JSON.stringify({
      type: 'email_event',
      emailId,
      eventType,
      contactEmail,
      businessName,
      timestamp: Date.now(),
    })
  );
}

// Export getRedisSub for SSE endpoint
export { getRedisSub };

// Publish email generation progress
export async function publishEmailGenerationProgress(
  jobId: string,
  data: {
    type: string;
    message?: string;
    step?: number;
    stats?: {
      total?: number;
      completed?: number;
      successful?: number;
      failed?: number;
      currentEmail?: string;
      currentBusiness?: string;
    };
    status?: string;
    details?: string;
    logType?: 'info' | 'success' | 'error' | 'warning' | 'step';
    completedEmails?: string[];
  }
) {
  await getRedisPub().publish(
    `${EMAIL_GENERATION_CHANNEL_PREFIX}${jobId}`,
    JSON.stringify({
      ...data,
      timestamp: Date.now(),
    })
  );
}

// Get email generation job data
export async function getEmailGenerationJob(jobId: string) {
  const data = await getRedis().get(`email:job:${jobId}`);
  return data ? JSON.parse(data) : null;
}

// Set email generation job data
export async function setEmailGenerationJob(
  jobId: string,
  data: {
    campaignId: string;
    leadIds: string[];
    mode: 'initial' | 'followup';
    status: 'running' | 'completed' | 'cancelled' | 'error';
    stats: {
      total: number;
      completed: number;
      successful: number;
      failed: number;
    };
    completedEmails: string[];
  },
  ttlSeconds = 3600 // 1 hour
) {
  await getRedis().setex(`email:job:${jobId}`, ttlSeconds, JSON.stringify(data));
}

// Update email generation job status
export async function updateEmailGenerationJobStatus(
  jobId: string,
  status: 'running' | 'completed' | 'cancelled' | 'error'
) {
  const job = await getEmailGenerationJob(jobId);
  if (job) {
    job.status = status;
    await setEmailGenerationJob(jobId, job);
  }
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
