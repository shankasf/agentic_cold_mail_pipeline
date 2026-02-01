import { Queue, JobsOptions } from 'bullmq';

// Queue names
export const QUEUE_NAMES = {
  FILE_PARSE: 'file-parse',
  EMAIL_GENERATE: 'email-generate',
  EMAIL_SEND: 'email-send',
  EXPORT_GENERATE: 'export-generate',
  SES_WARMUP: 'ses-warmup',
  SEQUENCE_PROCESSOR: 'sequence-processor',
  // Dead Letter Queues
  EMAIL_SEND_DLQ: 'email-send-dlq',
  FILE_PARSE_DLQ: 'file-parse-dlq',
  EMAIL_GENERATE_DLQ: 'email-generate-dlq',
} as const;

// Lazy queue initialization to prevent build-time Redis connection
let _fileParseQueue: Queue | null = null;
let _emailGenerateQueue: Queue | null = null;
let _emailSendQueue: Queue | null = null;
let _exportQueue: Queue | null = null;
let _sesWarmupQueue: Queue | null = null;
let _sequenceProcessorQueue: Queue | null = null;

function getRedisConnection() {
  const Redis = require('ioredis').default;
  return new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
}

export function getFileParseQueue(): Queue {
  if (!_fileParseQueue) {
    _fileParseQueue = new Queue(QUEUE_NAMES.FILE_PARSE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    });
  }
  return _fileParseQueue;
}

export function getEmailGenerateQueue(): Queue {
  if (!_emailGenerateQueue) {
    _emailGenerateQueue = new Queue(QUEUE_NAMES.EMAIL_GENERATE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    });
  }
  return _emailGenerateQueue;
}

export function getEmailSendQueue(): Queue {
  if (!_emailSendQueue) {
    _emailSendQueue = new Queue(QUEUE_NAMES.EMAIL_SEND, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
          // Add jitter to prevent thundering herd
        },
        // Remove completed/failed jobs after 24 hours to prevent memory buildup
        removeOnComplete: { age: 86400 },
        removeOnFail: { age: 86400 * 7 }, // Keep failed jobs for 7 days for debugging
      },
    });
  }
  return _emailSendQueue;
}

// Dead Letter Queue for failed email sends
let _emailSendDLQ: Queue | null = null;

export function getEmailSendDLQ(): Queue {
  if (!_emailSendDLQ) {
    _emailSendDLQ = new Queue(QUEUE_NAMES.EMAIL_SEND_DLQ, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        // DLQ jobs should not auto-retry
        attempts: 1,
        removeOnComplete: { age: 86400 * 30 }, // Keep for 30 days
      },
    });
  }
  return _emailSendDLQ;
}

// SES rate limit constants (used by workers)
export const SES_RATE_LIMIT = {
  max: 14,       // Maximum 14 emails per second (SES default limit)
  duration: 1000, // Per 1000ms (1 second)
};

export function getExportQueue(): Queue {
  if (!_exportQueue) {
    _exportQueue = new Queue(QUEUE_NAMES.EXPORT_GENERATE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
      },
    });
  }
  return _exportQueue;
}

export function getSESWarmupQueue(): Queue {
  if (!_sesWarmupQueue) {
    _sesWarmupQueue = new Queue(QUEUE_NAMES.SES_WARMUP, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    });
  }
  return _sesWarmupQueue;
}

export function getSequenceProcessorQueue(): Queue {
  if (!_sequenceProcessorQueue) {
    _sequenceProcessorQueue = new Queue(QUEUE_NAMES.SEQUENCE_PROCESSOR, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    });
  }
  return _sequenceProcessorQueue;
}

// Job data types
export interface FileParseJobData {
  uploadId: string;
  filePath: string;
  fileType: string;
}

export interface EmailGenerateJobData {
  uploadId: string;
}

export interface EmailSendJobData {
  emailDraftId: string;
}

export interface ExportJobData {
  exportType: 'csv' | 'pdf' | 'batch_zip';
  filters: Record<string, unknown>;
  emailIds?: string[];
}

export interface SESWarmupJobData {
  identityId?: string; // If not provided, process all warming identities
}

export interface SequenceProcessorJobData {
  sequenceId?: string; // If not provided, process all active sequences
}

// Helper to add jobs
export async function addFileParseJob(data: FileParseJobData) {
  return getFileParseQueue().add('parse', data);
}

export async function addEmailGenerateJob(data: EmailGenerateJobData) {
  return getEmailGenerateQueue().add('generate', data);
}

export async function addEmailSendJob(data: EmailSendJobData) {
  return getEmailSendQueue().add('send', data);
}

/**
 * Add multiple email send jobs in bulk (10x faster than sequential)
 * Uses BullMQ's addBulk for optimized batch insertion
 */
export async function addEmailSendJobsBulk(
  emailDraftIds: string[],
  options?: Partial<JobsOptions>
): Promise<void> {
  if (emailDraftIds.length === 0) return;

  const queue = getEmailSendQueue();

  // Create job definitions for bulk insert
  const jobs = emailDraftIds.map((emailDraftId) => ({
    name: 'send',
    data: { emailDraftId } as EmailSendJobData,
    opts: {
      ...options,
      // Add random jitter (0-30% of delay) to prevent thundering herd
      backoff: {
        type: 'exponential' as const,
        delay: 2000,
      },
    },
  }));

  // BullMQ's addBulk is optimized for batch operations
  // This is ~10x faster than adding jobs one at a time
  await queue.addBulk(jobs);
}

/**
 * Move a failed job to the Dead Letter Queue for manual processing
 */
export async function moveToDeadLetterQueue(
  jobId: string,
  originalQueue: string,
  failureReason: string,
  jobData: Record<string, unknown>
): Promise<void> {
  const dlq = getEmailSendDLQ();

  await dlq.add('dead-letter', {
    originalJobId: jobId,
    originalQueue,
    failureReason,
    jobData,
    movedAt: new Date().toISOString(),
  });
}

/**
 * Replay a job from the Dead Letter Queue
 */
export async function replayFromDLQ(dlqJobId: string): Promise<boolean> {
  const dlq = getEmailSendDLQ();
  const job = await dlq.getJob(dlqJobId);

  if (!job || !job.data) {
    return false;
  }

  const { originalQueue, jobData } = job.data;

  // Re-add to original queue
  if (originalQueue === QUEUE_NAMES.EMAIL_SEND && jobData?.emailDraftId) {
    await addEmailSendJob({ emailDraftId: jobData.emailDraftId as string });
    // Remove from DLQ after successful replay
    await job.remove();
    return true;
  }

  return false;
}

/**
 * Get count of jobs in the Dead Letter Queue
 */
export async function getDLQCount(): Promise<number> {
  const dlq = getEmailSendDLQ();
  const counts = await dlq.getJobCounts();
  return counts.waiting + counts.delayed + counts.active;
}

export async function addExportJob(data: ExportJobData) {
  return getExportQueue().add('export', data);
}

export async function addSESWarmupJob(data: SESWarmupJobData = {}) {
  return getSESWarmupQueue().add('warmup', data);
}

export async function addSequenceProcessorJob(data: SequenceProcessorJobData = {}) {
  return getSequenceProcessorQueue().add('process', data);
}

/**
 * Initialize repeatable jobs for scheduled tasks
 * Should be called once when the worker starts
 */
export async function initRepeatableJobs() {
  const warmupQueue = getSESWarmupQueue();
  const sequenceQueue = getSequenceProcessorQueue();

  // SES Warmup job - runs daily at 00:05 UTC (resets sent counts, updates warmup day)
  await warmupQueue.add(
    'daily-warmup',
    {},
    {
      repeat: {
        pattern: '5 0 * * *', // Every day at 00:05 UTC
      },
      jobId: 'ses-daily-warmup',
    }
  );

  // Sequence processor - runs every 5 minutes to process pending sequence steps
  await sequenceQueue.add(
    'process-sequences',
    {},
    {
      repeat: {
        pattern: '*/5 * * * *', // Every 5 minutes
      },
      jobId: 'sequence-processor',
    }
  );

  console.log('[Queue] Repeatable jobs initialized');
}
