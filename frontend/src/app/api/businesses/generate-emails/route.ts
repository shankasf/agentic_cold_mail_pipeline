import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserIdForCreate } from '@/lib/auth-utils';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  Errors,
} from '@/lib/api-utils';
import {
  setEmailGenerationJob,
  getEmailGenerationJob,
  publishEmailGenerationProgress,
} from '@/lib/redis';
import { sendNotificationEmail } from '@/lib/email-sender';
import { batchCreateEmails } from '@/lib/email-batch-operations';
import { v4 as uuidv4 } from 'uuid';

const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || 'sagarshankaranusa@gmail.com';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

interface GenerateEmailsRequest {
  businessIds: string[];
}

interface GenerateEmailsResponse {
  success: boolean;
  jobId?: string;
  message?: string;
  totalContacts?: number;
  businessCount?: number;
  error?: string;
  warning?: string;
  skippedBusinesses?: string[];
}

// Type assertions for customData fields
interface ContactWithCustom {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  customData?: Record<string, unknown>;
}

interface BusinessWithCustom {
  id: string;
  canonicalName: string;
  website: string | null;
  industryGuess: string | null;
  location: string | null;
  customData?: Record<string, unknown>;
  enrichmentData?: Record<string, unknown>;
  contacts: ContactWithCustom[];
  evidence: { id: string; evidenceType: string; extractedValue: string; confidence: number }[];
}

// Batch size for parallel processing chunks
const BULK_BATCH_SIZE = 50;

// Background email generation function - OPTIMIZED with bulk endpoint + batch insert
async function generateEmailsInBackground(
  jobId: string,
  userId: string,
  businessesWithContacts: BusinessWithCustom[],
  playbookMap: Record<string, Record<string, unknown>>
) {
  const totalContacts = businessesWithContacts.reduce((sum, b) => sum + b.contacts.length, 0);
  let successful = 0;
  let failed = 0;
  let completed = 0;

  // Update job as running
  await setEmailGenerationJob(jobId, {
    campaignId: '',
    leadIds: [],
    mode: 'initial',
    status: 'running',
    stats: { total: totalContacts, completed: 0, successful: 0, failed: 0 },
    completedEmails: [],
  });

  await publishEmailGenerationProgress(jobId, {
    type: 'started',
    message: `Starting parallel email generation for ${totalContacts} contacts`,
    stats: { total: totalContacts, completed: 0, successful: 0, failed: 0 },
  });

  // Flatten all contacts into a single array for bulk processing
  interface BulkContactItem {
    business: BusinessWithCustom;
    contact: ContactWithCustom;
    industryPlaybook: Record<string, unknown> | null;
  }

  const allItems: BulkContactItem[] = [];
  for (const business of businessesWithContacts) {
    const industry = business.industryGuess?.toLowerCase() || '';
    const industryPlaybook = playbookMap[industry] || null;

    for (const contact of business.contacts) {
      allItems.push({ business, contact, industryPlaybook });
    }
  }

  // Process in batches using bulk endpoint
  for (let i = 0; i < allItems.length; i += BULK_BATCH_SIZE) {
    // Check if job was cancelled at batch boundaries
    const jobStatus = await getEmailGenerationJob(jobId);
    if (jobStatus?.status === 'cancelled') {
      await publishEmailGenerationProgress(jobId, {
        type: 'cancelled',
        message: `Job cancelled. Generated ${successful} emails before stopping.`,
        stats: { total: totalContacts, completed, successful, failed },
      });
      await sendNotificationEmail({
        to: ADMIN_EMAIL,
        subject: `Email Generation Cancelled - ${successful} emails saved`,
        bodyText: `Email Generation Job Cancelled\n\nJob ID: ${jobId}\n\nSummary:\n- Total Contacts: ${totalContacts}\n- Emails Generated Before Stop: ${successful}\n- Failed: ${failed}\n\nThe job was manually cancelled. All emails generated before cancellation have been saved.`,
      }).catch(err => console.error('Failed to send admin notification:', err));
      return;
    }

    const batch = allItems.slice(i, i + BULK_BATCH_SIZE);
    const batchNum = Math.floor(i / BULK_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allItems.length / BULK_BATCH_SIZE);

    await publishEmailGenerationProgress(jobId, {
      type: 'progress',
      message: `Processing batch ${batchNum}/${totalBatches} (${batch.length} contacts in parallel)`,
      stats: { total: totalContacts, completed, successful, failed },
    });

    try {
      // Build bulk request payload
      const bulkPayload = {
        contacts: batch.map(item => ({
          business: {
            id: item.business.id,
            canonicalName: item.business.canonicalName,
            website: item.business.website,
            industryGuess: item.business.industryGuess,
            location: item.business.location,
            customData: item.business.customData || {},
            enrichmentData: item.business.enrichmentData || {},
          },
          contact: {
            id: item.contact.id,
            email: item.contact.email,
            name: item.contact.name,
            role: item.contact.role,
            phone: item.contact.phone,
            linkedinUrl: item.contact.linkedinUrl,
            customData: item.contact.customData || {},
          },
          evidence: item.business.evidence.map(ev => ({
            id: ev.id,
            evidenceType: ev.evidenceType,
            extractedValue: ev.extractedValue,
            confidence: ev.confidence,
          })),
          industry_playbook: item.industryPlaybook,
        })),
        concurrency: 10, // Process 10 emails in parallel within the AI service
      };

      // Call bulk endpoint
      const response = await fetch(`${AI_SERVICE_URL}/generate-emails-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bulkPayload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'AI bulk service error');
      }

      const bulkResult = await response.json();

      // Batch insert successful results
      const emailsToCreate = bulkResult.results
        .filter((r: { success: boolean }) => r.success)
        .map((result: { business_id: string; contact_id: string; subject: string; body_text: string; footer_text: string; personalization_tokens: Record<string, unknown>; confidence_score: number; deliverability_score: number; spam_flags: string[]; status: string }, idx: number) => ({
          userId,
          businessId: result.business_id || batch[idx].business.id,
          contactId: result.contact_id || batch[idx].contact.id,
          subject: result.subject,
          bodyText: result.body_text,
          footerText: result.footer_text || '',
          personalizationTokens: result.personalization_tokens || {},
          confidenceScore: result.confidence_score || 0,
          deliverabilityScore: result.deliverability_score || 0,
          spamFlags: result.spam_flags || [],
          status: result.status === 'needs_review' ? 'NEEDS_REVIEW' as const : 'DRAFT' as const,
        }));

      // Use batch insert for efficiency
      if (emailsToCreate.length > 0) {
        const batchResult = await batchCreateEmails(emailsToCreate);
        successful += batchResult.createdCount;

        if (batchResult.errors.length > 0) {
          console.error('Batch insert errors:', batchResult.errors);
        }
      }

      // Count failures
      const batchFailed = bulkResult.results.filter((r: { success: boolean }) => !r.success).length;
      failed += batchFailed;
      completed += batch.length;

      // Log failures
      for (const result of bulkResult.results.filter((r: { success: boolean }) => !r.success)) {
        console.error(`Failed to generate email for ${result.contact_id}:`, result.error);
        await publishEmailGenerationProgress(jobId, {
          type: 'error',
          message: `Failed: ${result.contact_id} - ${result.error}`,
          stats: { total: totalContacts, completed, successful, failed },
          logType: 'error',
        });
      }

      // Update job stats
      await setEmailGenerationJob(jobId, {
        campaignId: '',
        leadIds: [],
        mode: 'initial',
        status: 'running',
        stats: { total: totalContacts, completed, successful, failed },
        completedEmails: [],
      });

    } catch (error) {
      // If bulk endpoint fails, mark all batch items as failed
      failed += batch.length;
      completed += batch.length;
      console.error(`Batch ${batchNum} failed:`, error);

      await publishEmailGenerationProgress(jobId, {
        type: 'error',
        message: `Batch ${batchNum} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        stats: { total: totalContacts, completed, successful, failed },
        logType: 'error',
      });

      await setEmailGenerationJob(jobId, {
        campaignId: '',
        leadIds: [],
        mode: 'initial',
        status: 'running',
        stats: { total: totalContacts, completed, successful, failed },
        completedEmails: [],
      });
    }
  }

  // Mark job as completed
  await setEmailGenerationJob(jobId, {
    campaignId: '',
    leadIds: [],
    mode: 'initial',
    status: 'completed',
    stats: { total: totalContacts, completed, successful, failed },
    completedEmails: [],
  });

  await publishEmailGenerationProgress(jobId, {
    type: 'completed',
    message: `Email generation complete! Generated ${successful} emails successfully, ${failed} failed.`,
    stats: { total: totalContacts, completed, successful, failed },
  });

  // Send email notification to admin
  const endTime = new Date();
  await sendNotificationEmail({
    to: ADMIN_EMAIL,
    subject: `Email Generation Complete - ${successful} emails created`,
    bodyText: `Email Generation Job Completed

Job ID: ${jobId}

Summary:
- Total Contacts: ${totalContacts}
- Emails Generated: ${successful}
- Failed: ${failed}
- Success Rate: ${totalContacts > 0 ? Math.round((successful / totalContacts) * 100) : 0}%

Completed at: ${endTime.toLocaleString()}

The generated emails are now available in your dashboard for review and sending.`,
  }).catch(err => console.error('Failed to send admin notification:', err));
}

// POST /api/businesses/generate-emails - Start background email generation
export const POST = createApiHandler<GenerateEmailsResponse>(
  async (request: NextRequest, { logger }) => {
    const body = await parseJsonBody<GenerateEmailsRequest>(request, logger);
    const { businessIds } = body;

    if (!businessIds || !Array.isArray(businessIds) || businessIds.length === 0) {
      throw Errors.badRequest('Business IDs are required', 'businessIds');
    }

    const userId = await getUserIdForCreate();
    if (!userId) {
      throw Errors.unauthorized('User ID required');
    }
    const jobId = uuidv4();

    logger.debug('Starting background email generation', { businessCount: businessIds.length, userId, jobId });

    // Fetch businesses with their contacts
    const businesses = await prisma.business.findMany({
      where: { id: { in: businessIds } },
      include: {
        contacts: {
          take: 5,
        },
        evidence: {
          take: 10,
          select: {
            id: true,
            evidenceType: true,
            extractedValue: true,
            confidence: true,
          },
        },
      },
    });

    // Get all contact IDs from selected businesses
    const allContactIds = businesses.flatMap(b => b.contacts.map(c => c.id));

    // Find contacts that already have email drafts (for this user)
    const existingDrafts = await prisma.emailDraft.findMany({
      where: {
        contactId: { in: allContactIds },
        userId,
      },
      select: { contactId: true },
    });
    const contactsWithDrafts = new Set(existingDrafts.map(d => d.contactId));

    // Filter out contacts that already have drafts
    const businessesWithFilteredContacts = businesses.map(b => ({
      ...b,
      contacts: b.contacts.filter(c => !contactsWithDrafts.has(c.id)),
    }));

    const businessesTyped = businessesWithFilteredContacts as unknown as BusinessWithCustom[];
    const skippedContactsCount = contactsWithDrafts.size;

    if (businessesTyped.length === 0) {
      throw Errors.notFound('No businesses found');
    }

    const businessesWithContacts = businessesTyped.filter(b => b.contacts.length > 0);
    const businessesWithoutContacts = businessesTyped.filter(b => b.contacts.length === 0);

    if (businessesWithContacts.length === 0) {
      // Check if all contacts were skipped because they already have drafts
      if (skippedContactsCount > 0) {
        throw Errors.badRequest(
          `All ${skippedContactsCount} contact(s) already have email drafts. No new emails to generate.`
        );
      }
      const names = businessesWithoutContacts.slice(0, 3).map(b => b.canonicalName).join(', ');
      const more = businessesWithoutContacts.length > 3 ? ` and ${businessesWithoutContacts.length - 3} more` : '';
      throw Errors.badRequest(
        `No contacts found for selected companies (${names}${more}). Please add contacts first before generating emails.`
      );
    }

    // Get industry playbooks
    const playbooks = await prisma.industryPlaybook.findMany();
    const playbookMap: Record<string, Record<string, unknown>> = {};
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

    const totalContacts = businessesWithContacts.reduce((sum, b) => sum + b.contacts.length, 0);

    // Check if there are any contacts left to process
    if (totalContacts === 0) {
      throw Errors.badRequest(
        `All ${skippedContactsCount} contact(s) already have email drafts. No new emails to generate.`
      );
    }

    // Start background generation (don't await)
    generateEmailsInBackground(jobId, userId, businessesWithContacts, playbookMap).catch(err => {
      console.error('Background email generation error:', err);
    });

    let warning = '';
    const warnings: string[] = [];

    if (businessesWithoutContacts.length > 0) {
      const skippedNames = businessesWithoutContacts.slice(0, 3).map(b => b.canonicalName);
      const skippedMore = businessesWithoutContacts.length > 3 ? ` and ${businessesWithoutContacts.length - 3} more` : '';
      warnings.push(`Skipped ${businessesWithoutContacts.length} company(ies) with no contacts: ${skippedNames.join(', ')}${skippedMore}`);
    }

    if (skippedContactsCount > 0) {
      warnings.push(`Skipped ${skippedContactsCount} contact(s) that already have email drafts`);
    }

    warning = warnings.join('. ');

    logger.info('Background email generation started', {
      jobId,
      totalContacts,
      businessCount: businessesWithContacts.length,
    });

    return jsonResponse({
      success: true,
      jobId,
      message: `Email generation started in background for ${totalContacts} contacts`,
      totalContacts,
      businessCount: businessesWithContacts.length,
      warning: warning || undefined,
      skippedBusinesses: businessesWithoutContacts.length > 0 ? businessesWithoutContacts.map(b => b.canonicalName) : undefined,
    });
  },
  { requireAuth: true }
);
