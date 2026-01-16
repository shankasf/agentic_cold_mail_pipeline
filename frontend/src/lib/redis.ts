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

export default getRedis;
