/**
 * Background Worker for BullMQ Jobs
 * Run with: npx tsx src/lib/worker.ts
 */
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { parseFile } from './parsers';
import { sendEmail } from './email-sender';
import fs from 'fs/promises';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

// Separate Redis connection for publishing progress
const redisPub = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

const prisma = new PrismaClient();

const UPLOAD_PROGRESS_CHANNEL = 'upload:progress';

// Helper to publish and store progress
async function updateProgress(uploadId: string, progress: string) {
  // Update database
  await prisma.upload.update({
    where: { id: uploadId },
    data: { progressText: progress },
  });

  // Publish to Redis for real-time updates
  await redisPub.publish(
    UPLOAD_PROGRESS_CHANNEL,
    JSON.stringify({ uploadId, progress, timestamp: Date.now() })
  );

  console.log(`[Progress] ${uploadId}: ${progress}`);
}

// Queue names
const QUEUE_NAMES = {
  FILE_PARSE: 'file-parse',
  EMAIL_SEND: 'email-send',
  EXPORT_GENERATE: 'export-generate',
} as const;

// File Parse Worker
const fileParseWorker = new Worker(
  QUEUE_NAMES.FILE_PARSE,
  async (job: Job) => {
    const { uploadId, filePath, fileType } = job.data;
    console.log(`[FileParseWorker] Processing upload ${uploadId}`);

    try {
      await updateProgress(uploadId, 'Reading file...');

      // Read file
      const buffer = await fs.readFile(filePath);
      const fileSizeKB = Math.round(buffer.length / 1024);

      await updateProgress(uploadId, `Parsing ${fileType.toUpperCase()} file (${fileSizeKB} KB)...`);

      // Parse file
      const result = await parseFile(buffer, fileType);

      if (result.error) {
        await updateProgress(uploadId, `Parse error: ${result.error}`);
        throw new Error(result.error);
      }

      const totalChunks = result.chunks.length;
      await updateProgress(uploadId, `Found ${totalChunks} data chunks. Saving to database...`);

      // Save chunks to database
      for (let i = 0; i < result.chunks.length; i++) {
        const chunk = result.chunks[i];

        if (i % 10 === 0 || i === totalChunks - 1) {
          await updateProgress(uploadId, `Saving chunk ${i + 1}/${totalChunks}...`);
        }

        await prisma.parsedChunk.upsert({
          where: {
            uploadId_hash: {
              uploadId,
              hash: chunk.hash,
            },
          },
          update: {},
          create: {
            uploadId,
            chunkIndex: chunk.chunkIndex,
            textContent: chunk.textContent,
            sourceMeta: chunk.sourceMeta as object,
            hash: chunk.hash,
          },
        });
      }

      await updateProgress(uploadId, `Completed! ${totalChunks} chunks saved.`);

      // Update upload status
      await prisma.upload.update({
        where: { id: uploadId },
        data: { status: 'PARSED', progressText: `Completed! ${totalChunks} chunks saved.` },
      });

      console.log(`[FileParseWorker] Completed upload ${uploadId}: ${result.chunks.length} chunks`);
      return { chunks: result.chunks.length };
    } catch (error) {
      console.error(`[FileParseWorker] Error processing ${uploadId}:`, error);

      const errorMsg = `Error: ${String(error)}`;
      await updateProgress(uploadId, errorMsg);

      // Update upload with error
      await prisma.upload.update({
        where: { id: uploadId },
        data: {
          status: 'FAILED',
          errorText: String(error),
          progressText: errorMsg,
        },
      });

      throw error;
    }
  },
  { connection: redis, concurrency: 2 }
);

// Email Send Worker
const emailSendWorker = new Worker(
  QUEUE_NAMES.EMAIL_SEND,
  async (job: Job) => {
    const { emailDraftId } = job.data;
    console.log(`[EmailSendWorker] Sending email ${emailDraftId}`);

    const result = await sendEmail(emailDraftId);

    if (!result.success) {
      throw new Error(result.error);
    }

    console.log(`[EmailSendWorker] Sent email ${emailDraftId}`);
    return result;
  },
  { connection: redis, concurrency: 5 }
);

// Export Worker
const exportWorker = new Worker(
  QUEUE_NAMES.EXPORT_GENERATE,
  async (job: Job) => {
    const { exportType, filters, emailIds } = job.data;
    console.log(`[ExportWorker] Generating ${exportType} export`);

    // For now, exports are handled inline in the API routes
    // This worker can be expanded for heavy batch operations

    console.log(`[ExportWorker] Completed ${exportType} export`);
    return { exportType };
  },
  { connection: redis, concurrency: 1 }
);

// Event handlers
fileParseWorker.on('completed', (job) => {
  console.log(`[FileParseWorker] Job ${job.id} completed`);
});

fileParseWorker.on('failed', (job, error) => {
  console.error(`[FileParseWorker] Job ${job?.id} failed:`, error);
});

emailSendWorker.on('completed', (job) => {
  console.log(`[EmailSendWorker] Job ${job.id} completed`);
});

emailSendWorker.on('failed', (job, error) => {
  console.error(`[EmailSendWorker] Job ${job?.id} failed:`, error);
});

console.log('Workers started. Press Ctrl+C to exit.');

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down workers...');
  await fileParseWorker.close();
  await emailSendWorker.close();
  await exportWorker.close();
  await prisma.$disconnect();
  await redis.quit();
  await redisPub.quit();
  process.exit(0);
});
