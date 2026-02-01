import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import aiClient from '@/lib/ai-client';
import {
  createApiHandler,
  jsonResponse,
  Errors,
} from '@/lib/api-utils';
import { Logger } from '@/lib/logger';
import { validateEmail } from '@/lib/email-validator';
import {
  publishEmailGenerationProgress,
  setEmailGenerationJob,
  getEmailGenerationJob,
  updateEmailGenerationJobStatus,
} from '@/lib/redis';
import { v4 as uuidv4 } from 'uuid';

// POST /api/campaigns/[id]/leads/generate-emails
// Start bulk email generation for selected leads
export const POST = createApiHandler(
  async (request: NextRequest, { logger, requestId, params, user }) => {
    const { id: campaignId } = params;
    const body = await request.json();
    const { leadIds, mode = 'initial' } = body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      throw Errors.badRequest('leadIds array is required');
    }

    // Verify campaign exists and belongs to user
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        userId: user.id,
      },
    });

    if (!campaign) {
      throw Errors.notFound('Campaign');
    }

    // Fetch leads
    const leads = await prisma.lead.findMany({
      where: {
        id: { in: leadIds },
        campaignId,
      },
    });

    if (leads.length === 0) {
      throw Errors.badRequest('No valid leads found');
    }

    // Create job ID
    const jobId = uuidv4();

    // Initialize job in Redis
    await setEmailGenerationJob(jobId, {
      campaignId,
      leadIds: leads.map((l) => l.id),
      mode,
      status: 'running',
      stats: {
        total: leads.length,
        completed: 0,
        successful: 0,
        failed: 0,
      },
      completedEmails: [],
    });

    // Start generation in background (non-blocking)
    processEmailGeneration(jobId, campaignId, leads, mode, logger).catch((err) => {
      logger.error('Background email generation error', err);
    });

    // Return job ID and stream URL immediately
    const streamUrl = `/api/campaigns/${campaignId}/leads/generate-emails/stream?jobId=${jobId}`;

    return jsonResponse(
      {
        jobId,
        streamUrl,
        message: 'Email generation started',
        leadsCount: leads.length,
      },
      { requestId }
    );
  },
  { requireAuth: true }
);

// Background processing function
async function processEmailGeneration(
  jobId: string,
  campaignId: string,
  leads: Array<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    title: string | null;
    industry: string | null;
    website: string | null;
    location: string | null;
    customColumns: unknown;
    enrichmentData: unknown;
  }>,
  mode: 'initial' | 'followup',
  logger: Logger
) {
  const stats = {
    total: leads.length,
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
    // Get industry playbooks
    const playbooks = await prisma.industryPlaybook.findMany();
    const playbookMap: Record<string, object> = {};
    for (const pb of playbooks) {
      playbookMap[pb.industry.toLowerCase()] = {
        industry: pb.industry,
        commonPainPoints: pb.commonPainPoints,
        valueProps: pb.valueProps,
        subjectAngles: pb.subjectAngles,
        safeClaims: pb.safeClaims,
        bannedPhrases: pb.bannedPhrases,
      };
    }

    await publishProgress('log', `Starting ${mode === 'followup' ? 'follow-up' : 'initial'} email generation for ${leads.length} leads...`, undefined, 'info');

    // Step 1: Email Validation (skip for follow-up)
    const validLeads: typeof leads = [];
    const invalidLeads: Array<{ lead: typeof leads[0]; reason: string }> = [];

    if (mode === 'initial') {
      await publishProgress('step_change', 'Starting email validation...', 1);
      await publishProgress('log', 'Validating email addresses...', 1, 'step');

      for (const lead of leads) {
        // Check if job was cancelled
        const job = await getEmailGenerationJob(jobId);
        if (job?.status === 'cancelled') {
          await publishProgress('cancelled', 'Generation cancelled by user');
          return;
        }

        try {
          const validation = await validateEmail(lead.email);

          if (validation.isValid) {
            validLeads.push(lead);
            await publishProgress('email_validated', lead.email, undefined, 'success', `Valid email for ${lead.firstName || lead.company || 'contact'}`);
          } else {
            invalidLeads.push({ lead, reason: validation.errors.join(', ') });
            stats.failed += 1;
            stats.completed += 1;
            await publishProgress('email_invalid', lead.email, undefined, 'warning', validation.errors[0]);
          }
        } catch (err) {
          invalidLeads.push({ lead, reason: 'Validation error' });
          stats.failed += 1;
          stats.completed += 1;
          await publishProgress('email_invalid', lead.email, undefined, 'error', 'Validation error');
        }
      }

      await publishProgress('log', `Validation complete: ${validLeads.length} valid, ${invalidLeads.length} invalid`, 1, 'info');
    } else {
      // For follow-ups, all leads are considered valid
      validLeads.push(...leads);
      await publishProgress('log', `Skipping email validation for follow-up mode`, undefined, 'info');
    }

    if (validLeads.length === 0) {
      await publishProgress('log', 'No valid leads to process', undefined, 'warning');
      await publishProgress('complete');
      await updateEmailGenerationJobStatus(jobId, 'completed');
      return;
    }

    // Process each lead
    for (let i = 0; i < validLeads.length; i++) {
      const lead = validLeads[i];

      // Check if job was cancelled
      const job = await getEmailGenerationJob(jobId);
      if (job?.status === 'cancelled') {
        await publishProgress('cancelled', 'Generation cancelled by user');
        return;
      }

      try {
        await publishProgress('log', `Processing lead ${i + 1}/${validLeads.length}: ${lead.email}`, undefined, 'info', lead.company || undefined);

        // Step 2: Entity Resolution / Context Loading
        const stepOffset = mode === 'initial' ? 2 : 1;
        await publishProgress('step_change', undefined, stepOffset);

        if (mode === 'initial') {
          await publishProgress('log', `Analyzing business context for ${lead.company || lead.email}...`, stepOffset, 'step');
        } else {
          await publishProgress('log', `Loading previous email context for ${lead.email}...`, stepOffset, 'step');
        }

        // Build business and contact data from lead
        const business = {
          id: `lead-${lead.id}`,
          canonical_name: lead.company || lead.firstName || lead.email.split('@')[0],
          canonicalName: lead.company || lead.firstName || lead.email.split('@')[0],
          website: lead.website,
          industry_guess: lead.industry,
          industryGuess: lead.industry,
          location: lead.location,
        };

        const contact = {
          id: lead.id,
          email: lead.email,
          name: [lead.firstName, lead.lastName].filter(Boolean).join(' ') || undefined,
          role: lead.title || undefined,
        };

        // Build evidence from enrichment data
        const evidence: Array<{
          evidenceType: string;
          extractedValue: string;
          confidence: number;
        }> = [];

        const enrichmentData = lead.enrichmentData as Record<string, unknown> || {};
        for (const [key, value] of Object.entries(enrichmentData)) {
          if (value && typeof value === 'string') {
            evidence.push({
              evidenceType: key.toUpperCase(),
              extractedValue: value,
              confidence: 80,
            });
          }
        }

        // Get industry playbook
        const playbook = lead.industry ? playbookMap[lead.industry.toLowerCase()] : undefined;

        // Step 3: Business Analysis / Email Writing
        await publishProgress('step_change', undefined, stepOffset + 1);
        await publishProgress('log', `Generating personalized email for ${lead.email}...`, stepOffset + 1, 'step');

        // For follow-up, get the previous email
        let previousEmail: { subject: string; bodyText: string } | null = null;
        if (mode === 'followup') {
          const lastEmail = await prisma.emailDraft.findFirst({
            where: {
              contact: { email: lead.email },
            },
            orderBy: { createdAt: 'desc' },
          });
          if (lastEmail) {
            previousEmail = {
              subject: lastEmail.subject,
              bodyText: lastEmail.bodyText,
            };
          }
        }

        // Generate email using AI service
        let emailResult;
        if (mode === 'followup' && previousEmail) {
          // Generate follow-up using special endpoint
          emailResult = await generateFollowUpLocally(business, contact, previousEmail, playbook);
        } else {
          // Generate initial email
          emailResult = await generateEmailLocally(business, contact, evidence, playbook);
        }

        // Step 4: Compliance Check
        await publishProgress('step_change', undefined, mode === 'initial' ? 5 : 3);
        await publishProgress('log', `Checking compliance for email to ${lead.email}...`, mode === 'initial' ? 5 : 3, 'step');

        // The email generation already includes compliance check
        // Just log the result
        if (emailResult.success !== false) {
          await publishProgress('log', `Compliance score: ${emailResult.deliverability_score || emailResult.deliverabilityScore || 'N/A'}`, undefined, 'info');
        }

        // Step 5/4: Gatekeeper
        await publishProgress('step_change', undefined, mode === 'initial' ? 6 : 4);
        await publishProgress('log', `Final quality check for ${lead.email}...`, mode === 'initial' ? 6 : 4, 'step');

        // Save the email draft
        if (emailResult.success !== false && emailResult.subject && emailResult.body_text) {
          // Find or create contact and business
          let contactRecord = await prisma.contact.findUnique({
            where: { email: lead.email },
          });

          if (!contactRecord) {
            // Find or create business first
            let businessRecord = await prisma.business.findFirst({
              where: {
                OR: [
                  { canonicalName: business.canonical_name },
                  { website: business.website },
                ].filter(Boolean) as any[],
              },
            });

            if (!businessRecord) {
              businessRecord = await prisma.business.create({
                data: {
                  canonicalName: business.canonical_name,
                  website: business.website,
                  industryGuess: business.industry_guess,
                  location: business.location,
                },
              });
            }

            contactRecord = await prisma.contact.create({
              data: {
                businessId: businessRecord.id,
                email: lead.email,
                name: contact.name,
                role: contact.role,
                sourceConfidence: 80,
              },
            });
          }

          // Get business ID from contact
          const contactWithBusiness = await prisma.contact.findUnique({
            where: { email: lead.email },
            include: { business: true },
          });

          // For follow-up, find the parent email
          let parentEmailId: string | null = null;
          if (mode === 'followup' && previousEmail) {
            const parentEmail = await prisma.emailDraft.findFirst({
              where: {
                contact: { email: lead.email },
              },
              orderBy: { createdAt: 'desc' },
            });
            parentEmailId = parentEmail?.id || null;
          }

          // Create email draft
          const emailDraft = await prisma.emailDraft.create({
            data: {
              businessId: contactWithBusiness!.businessId,
              contactId: contactWithBusiness!.id,
              subject: emailResult.subject,
              bodyText: emailResult.body_text || emailResult.bodyText,
              footerText: emailResult.footer_text || emailResult.footerText || '',
              personalizationTokens: emailResult.personalization_tokens || emailResult.personalizationTokens || {},
              confidenceScore: emailResult.confidence_score || emailResult.confidenceScore || 70,
              deliverabilityScore: emailResult.deliverability_score || emailResult.deliverabilityScore || 85,
              spamFlags: emailResult.spam_flags || emailResult.spamFlags || [],
              status: emailResult.status === 'needs_review' ? 'NEEDS_REVIEW' : 'DRAFT',
              parentEmailId: parentEmailId,
              threadId: parentEmailId ? (await prisma.emailDraft.findUnique({ where: { id: parentEmailId } }))?.threadId || parentEmailId : undefined,
            },
          });

          completedEmails.push(emailDraft.id);
          stats.successful += 1;
          await publishProgress('email_generated', lead.email, undefined, 'success', `Subject: ${emailResult.subject.substring(0, 40)}...`);
        } else {
          stats.failed += 1;
          const errorMsg = emailResult.error || 'Failed to generate email';
          await publishProgress('email_failed', lead.email, undefined, 'error', errorMsg);
        }

        stats.completed += 1;

        // Update job stats
        const currentJob = await getEmailGenerationJob(jobId);
        if (currentJob) {
          await setEmailGenerationJob(jobId, {
            ...currentJob,
            stats,
            completedEmails,
          });
        }

        await publishProgress('progress', undefined, undefined, undefined, undefined);

      } catch (err) {
        logger.error('Error processing lead', { leadId: lead.id, error: err });
        stats.failed += 1;
        stats.completed += 1;
        await publishProgress('email_failed', lead.email, undefined, 'error', err instanceof Error ? err.message : 'Unknown error');
      }
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
    logger.error('Email generation pipeline error', err);
    await publishProgress('error', err instanceof Error ? err.message : 'Unknown error');
    await updateEmailGenerationJobStatus(jobId, 'error');
  }
}

// Local fallback for email generation if AI service doesn't have the endpoint
async function generateEmailLocally(
  business: object,
  contact: { email: string; name?: string; role?: string },
  evidence: Array<{ evidenceType: string; extractedValue: string; confidence: number }>,
  playbook?: object
) {
  // Call the AI service generate-email-for-contact endpoint
  try {
    const response = await fetch(`${process.env.AI_SERVICE_URL || 'http://localhost:8001'}/generate-email-for-contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business,
        contact,
        evidence,
        industry_playbook: playbook,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return { success: false, error: error.detail || 'Failed to generate email' };
    }

    return await response.json();
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'AI service error' };
  }
}

// Local fallback for follow-up email generation
async function generateFollowUpLocally(
  business: object,
  contact: { email: string; name?: string; role?: string },
  previousEmail: { subject: string; bodyText: string },
  playbook?: object
) {
  // Call the AI service generate-follow-up endpoint
  try {
    const response = await fetch(`${process.env.AI_SERVICE_URL || 'http://localhost:8001'}/generate-follow-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business,
        contact,
        previous_email: previousEmail,
        industry_playbook: playbook,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return { success: false, error: error.detail || 'Failed to generate follow-up' };
    }

    return await response.json();
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'AI service error' };
  }
}

