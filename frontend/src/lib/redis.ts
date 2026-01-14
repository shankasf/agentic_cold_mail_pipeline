import Redis from 'ioredis';

declare global {
  // eslint-disable-next-line no-var
  var redis: Redis | undefined;
  // eslint-disable-next-line no-var
  var redisPub: Redis | undefined;
  // eslint-disable-next-line no-var
  var redisSub: Redis | undefined;
}

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const redis =
  global.redis ??
  new Redis(redisUrl, {
    maxRetriesPerRequest: null,
  });

// Separate connections for pub/sub (Redis requires dedicated connections for subscribe)
const redisPub =
  global.redisPub ??
  new Redis(redisUrl, {
    maxRetriesPerRequest: null,
  });

const redisSub =
  global.redisSub ??
  new Redis(redisUrl, {
    maxRetriesPerRequest: null,
  });

// Store in global to prevent multiple instances in both dev and prod
global.redis = redis;
global.redisPub = redisPub;
global.redisSub = redisSub;

export { redis, redisPub, redisSub };

// Channel for upload progress updates
export const UPLOAD_PROGRESS_CHANNEL = 'upload:progress';

// Publish upload progress
export async function publishUploadProgress(uploadId: string, progress: string) {
  await redisPub.publish(
    UPLOAD_PROGRESS_CHANNEL,
    JSON.stringify({ uploadId, progress, timestamp: Date.now() })
  );
}

export default redis;
