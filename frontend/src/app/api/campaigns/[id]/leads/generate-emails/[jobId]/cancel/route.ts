import { NextRequest } from 'next/server';
import {
  createApiHandler,
  jsonResponse,
  Errors,
} from '@/lib/api-utils';
import {
  getEmailGenerationJob,
  updateEmailGenerationJobStatus,
  publishEmailGenerationProgress,
} from '@/lib/redis';

// POST /api/campaigns/[id]/leads/generate-emails/[jobId]/cancel
// Cancel an ongoing email generation job
export const POST = createApiHandler(
  async (_request: NextRequest, { requestId, params }) => {
    const { jobId } = params;

    if (!jobId) {
      throw Errors.badRequest('jobId is required');
    }

    // Get current job status
    const job = await getEmailGenerationJob(jobId);

    if (!job) {
      throw Errors.notFound('Job');
    }

    if (job.status !== 'running') {
      return jsonResponse(
        {
          message: 'Job is not running',
          status: job.status,
          stats: job.stats,
          savedEmails: job.completedEmails?.length || 0,
        },
        { requestId }
      );
    }

    // Update job status to cancelled
    await updateEmailGenerationJobStatus(jobId, 'cancelled');

    // Publish cancellation event
    await publishEmailGenerationProgress(jobId, {
      type: 'cancelled',
      message: 'Generation cancelled by user. Completed emails have been saved.',
      stats: job.stats,
    });

    return jsonResponse(
      {
        message: 'Job cancellation requested',
        status: 'cancelled',
        savedEmails: job.completedEmails?.length || 0,
        stats: job.stats,
      },
      { requestId }
    );
  },
  { requireAuth: true }
);
