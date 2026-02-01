import { NextRequest } from 'next/server';
import {
  createApiHandler,
  jsonResponse,
  Errors,
} from '@/lib/api-utils';
import {
  getEmailGenerationJob,
  setEmailGenerationJob,
  publishEmailGenerationProgress,
} from '@/lib/redis';

interface JobStatusResponse {
  success: boolean;
  jobId: string;
  status: 'running' | 'completed' | 'cancelled' | 'error' | 'not_found';
  stats?: {
    total: number;
    completed: number;
    successful: number;
    failed: number;
  };
  message?: string;
}

// GET /api/businesses/generate-emails/[jobId] - Get job status
export const GET = createApiHandler<JobStatusResponse>(
  async (request: NextRequest, { logger, params }) => {
    const { jobId } = await params;

    if (!jobId) {
      throw Errors.badRequest('Job ID is required');
    }

    logger.debug('Fetching job status', { jobId });

    const job = await getEmailGenerationJob(jobId);

    if (!job) {
      return jsonResponse({
        success: false,
        jobId,
        status: 'not_found',
        message: 'Job not found or expired',
      });
    }

    return jsonResponse({
      success: true,
      jobId,
      status: job.status,
      stats: job.stats,
      message: job.status === 'completed'
        ? `Generated ${job.stats.successful} emails successfully`
        : job.status === 'cancelled'
        ? `Cancelled after generating ${job.stats.successful} emails`
        : `Processing: ${job.stats.completed}/${job.stats.total} contacts`,
    });
  },
  { requireAuth: true }
);

// DELETE /api/businesses/generate-emails/[jobId] - Cancel job
export const DELETE = createApiHandler<JobStatusResponse>(
  async (request: NextRequest, { logger, params }) => {
    const { jobId } = await params;

    if (!jobId) {
      throw Errors.badRequest('Job ID is required');
    }

    logger.info('Cancelling job', { jobId });

    const job = await getEmailGenerationJob(jobId);

    if (!job) {
      return jsonResponse({
        success: false,
        jobId,
        status: 'not_found',
        message: 'Job not found or expired',
      });
    }

    if (job.status !== 'running') {
      return jsonResponse({
        success: false,
        jobId,
        status: job.status,
        stats: job.stats,
        message: `Job is already ${job.status}`,
      });
    }

    // Mark job as cancelled
    await setEmailGenerationJob(jobId, {
      ...job,
      status: 'cancelled',
    });

    await publishEmailGenerationProgress(jobId, {
      type: 'cancelling',
      message: 'Cancellation requested. Will stop after current email...',
      stats: job.stats,
    });

    logger.info('Job cancellation requested', { jobId, currentStats: job.stats });

    return jsonResponse({
      success: true,
      jobId,
      status: 'cancelled',
      stats: job.stats,
      message: `Cancellation requested. ${job.stats.successful} emails already saved.`,
    });
  },
  { requireAuth: true }
);
