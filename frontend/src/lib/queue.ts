import { Queue } from 'bullmq';

// Queue names
export const QUEUE_NAMES = {
  FILE_PARSE: 'file-parse',
  EMAIL_GENERATE: 'email-generate',
  EMAIL_SEND: 'email-send',
  EXPORT_GENERATE: 'export-generate',
  SES_WARMUP: 'ses-warmup',
  SEQUENCE_PROCESSOR: 'sequence-processor',
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
        backoff: { type: 'exponential', delay: 2000 },
      },
    });
  }
  return _emailSendQueue;
}

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
