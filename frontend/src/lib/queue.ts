import { Queue, Worker, Job } from 'bullmq';
import redis from './redis';

// Queue names
export const QUEUE_NAMES = {
  FILE_PARSE: 'file-parse',
  EMAIL_GENERATE: 'email-generate',
  EMAIL_SEND: 'email-send',
  EXPORT_GENERATE: 'export-generate',
} as const;

// Create queues
export const fileParseQueue = new Queue(QUEUE_NAMES.FILE_PARSE, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  },
});

export const emailGenerateQueue = new Queue(QUEUE_NAMES.EMAIL_GENERATE, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  },
});

export const emailSendQueue = new Queue(QUEUE_NAMES.EMAIL_SEND, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  },
});

export const exportQueue = new Queue(QUEUE_NAMES.EXPORT_GENERATE, {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 1000 },
  },
});

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
  return fileParseQueue.add('parse', data);
}

export async function addEmailGenerateJob(data: EmailGenerateJobData) {
  return emailGenerateQueue.add('generate', data);
}

export async function addEmailSendJob(data: EmailSendJobData) {
  return emailSendQueue.add('send', data);
}

export async function addExportJob(data: ExportJobData) {
  return exportQueue.add('export', data);
}
