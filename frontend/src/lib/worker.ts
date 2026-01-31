/**
 * Background Worker for BullMQ Jobs
 * Run with: npx tsx src/lib/worker.ts
 */
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient, SESIdentityStatus } from '@prisma/client';
import { parseFile } from './parsers';
import { sendEmail } from './email-sender';
import { getWarmupLimit, sendEmail as sendSESEmail } from './ses';
import { initRepeatableJobs, QUEUE_NAMES } from './queue';
import { createWorkerLogger, logger as baseLogger } from './logger';
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
async function updateProgress(uploadId: string, progress: string, logger?: ReturnType<typeof createWorkerLogger>) {
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

  if (logger) {
    logger.debug('Progress update', { uploadId, progress });
  }
}

// File Parse Worker
const fileParseWorker = new Worker(
  QUEUE_NAMES.FILE_PARSE,
  async (job: Job) => {
    const { uploadId, filePath, fileType } = job.data;
    const logger = createWorkerLogger('FileParseWorker', job.id);
    logger.info('Processing upload', { uploadId, filePath, fileType });

    try {
      await updateProgress(uploadId, 'Reading file...', logger);

      // Read file
      const buffer = await fs.readFile(filePath);
      const fileSizeKB = Math.round(buffer.length / 1024);

      await updateProgress(uploadId, `Parsing ${fileType.toUpperCase()} file (${fileSizeKB} KB)...`, logger);

      // Parse file
      const result = await parseFile(buffer, fileType);

      if (result.error) {
        await updateProgress(uploadId, `Parse error: ${result.error}`, logger);
        throw new Error(result.error);
      }

      const totalChunks = result.chunks.length;
      await updateProgress(uploadId, `Found ${totalChunks} data chunks. Saving to database...`, logger);

      // Save chunks to database
      for (let i = 0; i < result.chunks.length; i++) {
        const chunk = result.chunks[i];

        if (i % 10 === 0 || i === totalChunks - 1) {
          await updateProgress(uploadId, `Saving chunk ${i + 1}/${totalChunks}...`, logger);
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

      await updateProgress(uploadId, `Completed! ${totalChunks} chunks saved.`, logger);

      // Update upload status
      await prisma.upload.update({
        where: { id: uploadId },
        data: { status: 'PARSED', progressText: `Completed! ${totalChunks} chunks saved.` },
      });

      logger.info('Upload completed', { uploadId, chunks: result.chunks.length });
      return { chunks: result.chunks.length };
    } catch (error) {
      logger.error('Error processing upload', error, { uploadId });

      const errorMsg = `Error: ${String(error)}`;
      await updateProgress(uploadId, errorMsg, logger);

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
    const logger = createWorkerLogger('EmailSendWorker', job.id);
    logger.info('Sending email', { emailDraftId });

    const result = await sendEmail(emailDraftId);

    if (!result.success) {
      logger.error('Email send failed', new Error(result.error), { emailDraftId });
      throw new Error(result.error);
    }

    logger.info('Email sent successfully', { emailDraftId });
    return result;
  },
  { connection: redis, concurrency: 5 }
);

// Export Worker
const exportWorker = new Worker(
  QUEUE_NAMES.EXPORT_GENERATE,
  async (job: Job) => {
    const { exportType, filters, emailIds } = job.data;
    const logger = createWorkerLogger('ExportWorker', job.id);
    logger.info('Generating export', { exportType, emailCount: emailIds?.length });

    // For now, exports are handled inline in the API routes
    // This worker can be expanded for heavy batch operations

    logger.info('Export completed', { exportType });
    return { exportType };
  },
  { connection: redis, concurrency: 1 }
);

// SES Warmup Worker - manages daily warmup progression
const sesWarmupWorker = new Worker(
  QUEUE_NAMES.SES_WARMUP,
  async (job: Job) => {
    const logger = createWorkerLogger('SESWarmupWorker', job.id);
    logger.info('Running warmup job', { jobName: job.name });

    const { identityId } = job.data || {};

    // Build query - either specific identity or all warming identities
    const whereClause = identityId
      ? { id: identityId }
      : {
          warmupEnabled: true,
          status: {
            in: ['VERIFIED', 'WARMING', 'ACTIVE'] as SESIdentityStatus[],
          },
        };

    const identities = await prisma.sESIdentity.findMany({
      where: whereClause,
    });

    logger.info('Processing identities', { count: identities.length });

    for (const identity of identities) {
      try {
        // Calculate new warmup day (increment if warmup is enabled)
        const newWarmupDay = identity.warmupEnabled ? identity.warmupDay + 1 : identity.warmupDay;

        // Get the new daily limit based on warmup day
        const newDailyLimit = identity.warmupEnabled
          ? getWarmupLimit(newWarmupDay)
          : identity.dailyLimit;

        // Update status based on warmup progress
        let newStatus = identity.status;
        if (identity.warmupEnabled && identity.status === 'VERIFIED') {
          newStatus = 'WARMING';
        } else if (identity.warmupEnabled && newWarmupDay >= 63) {
          // Warmup complete after 63 days
          newStatus = 'ACTIVE';
        }

        // Reset daily counters and update warmup progression
        await prisma.sESIdentity.update({
          where: { id: identity.id },
          data: {
            sentToday: 0,
            warmupDay: newWarmupDay,
            dailyLimit: newDailyLimit,
            status: newStatus,
          },
        });

        logger.debug('Updated identity warmup', {
          emailAddress: identity.emailAddress,
          warmupDay: newWarmupDay,
          dailyLimit: newDailyLimit,
          status: newStatus,
        });
      } catch (error) {
        logger.error('Error updating identity', error, { emailAddress: identity.emailAddress });
      }
    }

    return { processedCount: identities.length };
  },
  { connection: redis, concurrency: 1 }
);

// Sequence Processor Worker - processes pending sequence steps
const sequenceProcessorWorker = new Worker(
  QUEUE_NAMES.SEQUENCE_PROCESSOR,
  async (job: Job) => {
    const logger = createWorkerLogger('SequenceProcessor', job.id);
    logger.info('Running sequence job', { jobName: job.name });

    const { sequenceId } = job.data || {};

    // Get active sequences (optionally filtered by ID)
    const sequences = await prisma.sequence.findMany({
      where: {
        ...(sequenceId ? { id: sequenceId } : {}),
        status: 'ACTIVE',
      },
      include: {
        sesIdentity: true,
        steps: {
          orderBy: { stepNumber: 'asc' },
        },
      },
    });

    logger.info('Processing active sequences', { count: sequences.length });

    let totalProcessed = 0;
    const now = new Date();

    for (const sequence of sequences) {
      // Skip if no SES identity configured
      if (!sequence.sesIdentity) {
        logger.debug('Sequence has no SES identity, skipping', { sequenceId: sequence.id });
        continue;
      }

      // Check if within sending hours
      const sendingHours = sequence.sendingHours as { start: number; end: number };
      const currentHour = now.getUTCHours(); // Simplified - should use sequence timezone
      if (currentHour < sendingHours.start || currentHour >= sendingHours.end) {
        logger.debug('Outside sending hours', { sequenceId: sequence.id, currentHour, sendingHours });
        continue;
      }

      // Check if today is a sending day
      const sendingDays = sequence.sendingDays as number[];
      const currentDay = now.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.
      if (!sendingDays.includes(currentDay)) {
        logger.debug('Not a sending day', { sequenceId: sequence.id, currentDay, sendingDays });
        continue;
      }

      // Get pending lead steps that are ready to send
      const pendingSteps = await prisma.sequenceLeadStep.findMany({
        where: {
          sequenceLead: {
            sequenceId: sequence.id,
            status: 'ACTIVE',
          },
          status: 'PENDING',
          scheduledFor: {
            lte: now,
          },
        },
        include: {
          sequenceLead: {
            include: {
              contact: true,
              business: true,
            },
          },
          step: true,
        },
        take: 50, // Process in batches
      });

      logger.debug('Found pending steps', { sequenceId: sequence.id, count: pendingSteps.length });

      for (const leadStep of pendingSteps) {
        // Check if identity has remaining capacity
        if (sequence.sesIdentity.sentToday >= sequence.sesIdentity.dailyLimit) {
          logger.warn('Daily limit reached', {
            emailAddress: sequence.sesIdentity.emailAddress,
            sentToday: sequence.sesIdentity.sentToday,
            dailyLimit: sequence.sesIdentity.dailyLimit,
          });
          break;
        }

        try {
          // Check skip conditions
          if (leadStep.step.skipIfReplied && leadStep.sequenceLead.status === 'REPLIED') {
            await prisma.sequenceLeadStep.update({
              where: { id: leadStep.id },
              data: { status: 'SKIPPED', skippedReason: 'Lead replied' },
            });
            continue;
          }

          // Personalize template with contact/business data
          const contact = leadStep.sequenceLead.contact;
          const business = leadStep.sequenceLead.business;
          const personalizedSubject = personalizeTemplate(leadStep.step.subjectTemplate, contact, business);
          const personalizedBody = personalizeTemplate(leadStep.step.bodyTemplate, contact, business);

          // Send the email via SES
          const sendResult = await sendSESEmail({
            from: sequence.sesIdentity.emailAddress,
            fromName: sequence.sesIdentity.displayName || undefined,
            to: contact.email,
            subject: personalizedSubject,
            bodyText: personalizedBody,
            bodyHtml: `<div style="font-family: sans-serif;">${personalizedBody.replace(/\n/g, '<br>')}</div>`,
            configSetName: sequence.sesIdentity.configSetName || undefined,
          });

          if (sendResult.success) {
            // Update lead step status
            await prisma.sequenceLeadStep.update({
              where: { id: leadStep.id },
              data: {
                status: 'SENT',
                sentAt: now,
              },
            });

            // Update identity sent count
            await prisma.sESIdentity.update({
              where: { id: sequence.sesIdentity.id },
              data: {
                sentToday: { increment: 1 },
                lastSentAt: now,
              },
            });

            // Update lead current step
            await prisma.sequenceLead.update({
              where: { id: leadStep.sequenceLead.id },
              data: {
                currentStep: leadStep.step.stepNumber + 1,
                lastActionAt: now,
              },
            });

            totalProcessed++;
            logger.debug('Email sent', { sequenceId: sequence.id, contactEmail: contact.email });
          } else {
            logger.error('Failed to send email', new Error(sendResult.error || 'Unknown error'), {
              sequenceId: sequence.id,
              contactEmail: contact.email,
            });
            await prisma.sequenceLeadStep.update({
              where: { id: leadStep.id },
              data: { status: 'FAILED', skippedReason: sendResult.error },
            });
          }
        } catch (error) {
          logger.error('Error processing lead step', error, { leadStepId: leadStep.id });
        }
      }
    }

    logger.info('Sequence processing completed', { processedCount: totalProcessed });
    return { processedCount: totalProcessed };
  },
  { connection: redis, concurrency: 2 }
);

// Helper function to personalize templates with contact/business data
function personalizeTemplate(
  template: string,
  contact: { firstName?: string | null; lastName?: string | null; email: string },
  business: { canonicalName: string; website?: string | null } | null
): string {
  return template
    .replace(/\{\{firstName\}\}/g, contact.firstName || '')
    .replace(/\{\{lastName\}\}/g, contact.lastName || '')
    .replace(/\{\{email\}\}/g, contact.email)
    .replace(/\{\{companyName\}\}/g, business?.canonicalName || '')
    .replace(/\{\{domain\}\}/g, business?.website || '')
    .replace(/\{\{company\}\}/g, business?.canonicalName || '');
}

// Event handlers with structured logging
const workerLogger = createWorkerLogger('WorkerEvents');

fileParseWorker.on('completed', (job) => {
  createWorkerLogger('FileParseWorker', job.id).info('Job completed');
});

fileParseWorker.on('failed', (job, error) => {
  createWorkerLogger('FileParseWorker', job?.id).error('Job failed', error);
});

emailSendWorker.on('completed', (job) => {
  createWorkerLogger('EmailSendWorker', job.id).info('Job completed');
});

emailSendWorker.on('failed', (job, error) => {
  createWorkerLogger('EmailSendWorker', job?.id).error('Job failed', error);
});

sesWarmupWorker.on('completed', (job) => {
  createWorkerLogger('SESWarmupWorker', job.id).info('Job completed');
});

sesWarmupWorker.on('failed', (job, error) => {
  createWorkerLogger('SESWarmupWorker', job?.id).error('Job failed', error);
});

sequenceProcessorWorker.on('completed', (job) => {
  createWorkerLogger('SequenceProcessor', job.id).info('Job completed');
});

sequenceProcessorWorker.on('failed', (job, error) => {
  createWorkerLogger('SequenceProcessor', job?.id).error('Job failed', error);
});

// Initialize repeatable jobs
initRepeatableJobs().catch((error) => {
  baseLogger.error('Failed to initialize repeatable jobs', error);
});

baseLogger.info('Workers started');

// Graceful shutdown
process.on('SIGINT', async () => {
  baseLogger.info('Shutting down workers...');
  await fileParseWorker.close();
  await emailSendWorker.close();
  await exportWorker.close();
  await sesWarmupWorker.close();
  await sequenceProcessorWorker.close();
  await prisma.$disconnect();
  await redis.quit();
  await redisPub.quit();
  baseLogger.info('Workers shut down gracefully');
  process.exit(0);
});
