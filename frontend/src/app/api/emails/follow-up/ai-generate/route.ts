import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  Errors,
} from '@/lib/api-utils';
import {
  publishEmailGenerationProgress,
  setEmailGenerationJob,
  updateEmailGenerationJobStatus,
} from '@/lib/redis';
import { v4 as uuidv4 } from 'uuid';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

// POST /api/emails/follow-up/ai-generate - Generate AI follow-up emails
export const POST = createApiHandler(
  async (request: NextRequest, { logger, requestId }) => {
    const body = await parseJsonBody<{
      emailIds: string[];
    }>(request, logger);

    const { emailIds } = body;

    if (!emailIds || !Array.isArray(emailIds) || emailIds.length === 0) {
      throw Errors.badRequest('Email IDs are required');
    }

    // Create job ID
    const jobId = uuidv4();

    // Get the original emails with their business and contact info
    const originalEmails = await prisma.emailDraft.findMany({
      where: { id: { in: emailIds } },
      include: {
        contact: true,
        business: true,
      },
    });

    if (originalEmails.length === 0) {
      throw Errors.notFound('Emails');
    }

    // Initialize job in Redis
    await setEmailGenerationJob(jobId, {
      campaignId: '',
      leadIds: emailIds,
      mode: 'followup',
      status: 'running',
      stats: {
        total: originalEmails.length,
        completed: 0,
        successful: 0,
        failed: 0,
      },
      completedEmails: [],
    });

    // Start generation in background
    processAIFollowUpGeneration(jobId, originalEmails, logger).catch((err) => {
      logger.error('Background AI follow-up generation error', err);
    });

    // Return job ID and stream URL
    const streamUrl = `/api/emails/follow-up/ai-generate/stream?jobId=${jobId}`;

    return jsonResponse(
      {
        jobId,
        streamUrl,
        message: 'AI follow-up generation started',
        emailCount: originalEmails.length,
      },
      { requestId }
    );
  },
  { requireAuth: true }
);

// Background processing function - includes customData for AI personalization
async function processAIFollowUpGeneration(
  jobId: string,
  originalEmails: Array<{
    id: string;
    subject: string;
    bodyText: string;
    fromName: string;
    fromEmail: string;
    footerText: string;
    threadId: string | null;
    businessId: string;
    contactId: string;
    contact: {
      id: string;
      email: string;
      name: string | null;
      role: string | null;
      phone?: string | null;
      linkedinUrl?: string | null;
      customData?: unknown;
    };
    business: {
      id: string;
      canonicalName: string;
      website: string | null;
      industryGuess: string | null;
      location: string | null;
      customData?: unknown;
      enrichmentData?: unknown;
    };
  }>,
  logger: { error: (msg: string, err?: unknown, meta?: Record<string, unknown>) => void }
) {
  const stats = {
    total: originalEmails.length,
    completed: 0,
    successful: 0,
    failed: 0,
  };
  const completedEmails: string[] = [];

  const publishProgress = async (
    type: string,
    message?: string,
    step?: number,
    logType?: 'info' | 'success' | 'error' | 'warning' | 'step',
    details?: string
  ) => {
    await publishEmailGenerationProgress(jobId, {
      type,
      message,
      step,
      stats,
      logType,
      details,
    });
  };

  try {
    await publishProgress('log', `Starting AI follow-up generation for ${originalEmails.length} emails...`, undefined, 'info');

    // Step 1: Context Loading
    await publishProgress('step_change', 'Loading email context...', 1);
    await publishProgress('log', 'Loading previous email context...', 1, 'step');

    for (let i = 0; i < originalEmails.length; i++) {
      const email = originalEmails[i];

      try {
        await publishProgress('log', `Processing ${i + 1}/${originalEmails.length}: ${email.contact.email}`, undefined, 'info', email.business.canonicalName);

        // Step 2: Follow-up Writing
        await publishProgress('step_change', undefined, 2);
        await publishProgress('log', `Generating follow-up for ${email.contact.email}...`, 2, 'step');

        // Prepare data for AI service - include ALL customData for personalization
        const business = {
          id: email.business.id,
          canonical_name: email.business.canonicalName,
          website: email.business.website,
          industry_guess: email.business.industryGuess,
          location: email.business.location,
          // Include ALL custom data from import for AI personalization
          customData: email.business.customData || {},
          enrichmentData: email.business.enrichmentData || {},
        };

        const contact = {
          id: email.contact.id,
          email: email.contact.email,
          name: email.contact.name || undefined,
          role: email.contact.role || undefined,
          phone: email.contact.phone || undefined,
          linkedinUrl: email.contact.linkedinUrl || undefined,
          // Include ALL custom contact data for AI personalization
          customData: email.contact.customData || {},
        };

        const previousEmail = {
          subject: email.subject,
          bodyText: email.bodyText,
        };

        // Call AI service to generate follow-up with ALL available data
        const response = await fetch(`${AI_SERVICE_URL}/generate-follow-up`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business,
            contact,
            previous_email: previousEmail,
            industry_playbook: null,
          }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.detail || 'AI service error');
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Failed to generate follow-up');
        }

        // Step 3: Compliance Check (already done by AI service)
        await publishProgress('step_change', undefined, 3);
        await publishProgress('log', `Compliance score: ${result.deliverability_score}`, 3, 'info');

        // Step 4: Save
        await publishProgress('step_change', undefined, 4);
        await publishProgress('log', `Saving follow-up email...`, 4, 'step');

        // Determine thread ID
        const threadId = email.threadId || email.id;

        // Create follow-up email
        const followUpEmail = await prisma.emailDraft.create({
          data: {
            businessId: email.businessId,
            contactId: email.contactId,
            fromName: email.fromName,
            fromEmail: email.fromEmail,
            subject: result.subject,
            bodyText: result.body_text,
            footerText: result.footer_text || email.footerText,
            personalizationTokens: {
              ...(result.personalization_tokens || {}),
              follow_up: true,
              original_email_id: email.id,
              ai_generated: true,
            },
            confidenceScore: result.confidence_score || 80,
            deliverabilityScore: result.deliverability_score || 85,
            spamFlags: result.spam_flags || [],
            status: result.status === 'needs_review' ? 'NEEDS_REVIEW' : 'DRAFT',
            pipelineType: 'AGENTIC',
            parentEmailId: email.id,
            threadId,
          },
        });

        // Update original email with thread ID if not set
        if (!email.threadId) {
          await prisma.emailDraft.update({
            where: { id: email.id },
            data: { threadId: email.id },
          });
        }

        completedEmails.push(followUpEmail.id);
        stats.successful += 1;
        await publishProgress('email_generated', email.contact.email, undefined, 'success', `Subject: ${result.subject.substring(0, 40)}...`);

      } catch (err) {
        logger.error('Error generating follow-up', { emailId: email.id, error: err });
        stats.failed += 1;
        await publishProgress('email_failed', email.contact.email, undefined, 'error', err instanceof Error ? err.message : 'Unknown error');
      }

      stats.completed += 1;
      await publishProgress('progress');
    }

    // Complete - include generated email IDs for sending
    await publishProgress('log', `Generation complete: ${stats.successful} successful, ${stats.failed} failed`, undefined, 'success');
    await publishEmailGenerationProgress(jobId, {
      type: 'complete',
      stats,
      completedEmails,
    });
    await updateEmailGenerationJobStatus(jobId, 'completed');

  } catch (err) {
    logger.error('AI follow-up generation pipeline error', err);
    await publishProgress('error', err instanceof Error ? err.message : 'Unknown error');
    await updateEmailGenerationJobStatus(jobId, 'error');
  }
}
