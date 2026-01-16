import { Queue } from 'bullmq';

// Queue names
export const QUEUE_NAMES = {
  FILE_PARSE: 'file-parse',
  EMAIL_GENERATE: 'email-generate',
  EMAIL_SEND: 'email-send',
  EXPORT_GENERATE: 'export-generate',
} as const;

// Lazy queue initialization to prevent build-time Redis connection
let _fileParseQueue: Queue | null = null;
let _emailGenerateQueue: Queue | null = null;
let _emailSendQueue: Queue | null = null;
let _exportQueue: Queue | null = null;

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
