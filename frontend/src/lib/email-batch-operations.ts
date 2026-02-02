/**
 * Email Batch Operations
 *
 * High-performance batch operations for bulk email processing.
 * Uses batched database calls and raw SQL for optimal performance.
 */

import prisma from '@/lib/prisma';
import { Prisma, EmailStatus } from '@prisma/client';

// Batch size for chunked operations
const BATCH_SIZE = 100;

/**
 * Input type for batch email creation
 */
export interface EmailDraftCreateInput {
  userId?: string;
  businessId: string;
  contactId: string;
  subject: string;
  bodyText: string;
  footerText?: string;
  personalizationTokens?: Prisma.InputJsonValue;
  confidenceScore?: number;
  deliverabilityScore?: number;
  spamFlags?: Prisma.InputJsonValue;
  status?: EmailStatus;
  pipelineType?: 'AGENTIC' | 'TEMPLATE';
  templateId?: string;
  fromName?: string;
  fromEmail?: string;
}

/**
 * Batch create emails in chunks to avoid overwhelming the database
 * @param emails - Array of email drafts to create
 * @returns Object with created count and any errors
 */
export async function batchCreateEmails(
  emails: EmailDraftCreateInput[]
): Promise<{ createdCount: number; errors: string[] }> {
  let createdCount = 0;
  const errors: string[] = [];

  // Process in batches
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);

    try {
      const result = await prisma.emailDraft.createMany({
        data: batch.map((email) => ({
          userId: email.userId,
          businessId: email.businessId,
          contactId: email.contactId,
          subject: email.subject,
          bodyText: email.bodyText,
          footerText: email.footerText || '',
          personalizationTokens: email.personalizationTokens ?? Prisma.JsonNull,
          confidenceScore: email.confidenceScore || 0,
          deliverabilityScore: email.deliverabilityScore || 0,
          spamFlags: email.spamFlags ?? Prisma.JsonNull,
          status: email.status || 'DRAFT',
          pipelineType: email.pipelineType || 'AGENTIC',
          templateId: email.templateId,
          fromName: email.fromName || 'CallSphere',
          fromEmail: email.fromEmail || 'greetings@callsphere.tech',
        })),
        skipDuplicates: true,
      });

      createdCount += result.count;
    } catch (error) {
      const errorMsg = `Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      errors.push(errorMsg);
      console.error(errorMsg, error);
    }
  }

  return { createdCount, errors };
}

/**
 * Batch approve emails with a single database call
 * @param emailIds - Array of email IDs to approve
 * @param options - Additional options (force bypasses deliverability threshold)
 * @returns Number of emails approved
 */
export async function batchApproveEmails(
  emailIds: string[],
  options: {
    force?: boolean;
    deliverabilityThreshold?: number;
  } = {}
): Promise<{ approvedCount: number }> {
  const { force = false, deliverabilityThreshold = 70 } = options;

  const whereClause: Prisma.EmailDraftWhereInput = {
    id: { in: emailIds },
    status: { in: ['DRAFT', 'NEEDS_REVIEW'] },
  };

  // Apply deliverability threshold unless forced
  if (!force) {
    whereClause.deliverabilityScore = { gte: deliverabilityThreshold };
  }

  const result = await prisma.emailDraft.updateMany({
    where: whereClause,
    data: {
      status: 'APPROVED',
      updatedAt: new Date(),
    },
  });

  return { approvedCount: result.count };
}

/**
 * Batch update email status
 * @param emailIds - Array of email IDs
 * @param status - New status to set
 * @returns Number of emails updated
 */
export async function batchUpdateEmailStatus(
  emailIds: string[],
  status: EmailStatus
): Promise<{ updatedCount: number }> {
  const result = await prisma.emailDraft.updateMany({
    where: {
      id: { in: emailIds },
    },
    data: {
      status,
      updatedAt: new Date(),
    },
  });

  return { updatedCount: result.count };
}

/**
 * Get available SES identities for round-robin assignment
 * Returns identities sorted by sent count (least used first)
 */
export async function getAvailableIdentities(
  userId?: string
): Promise<{ id: string; emailAddress: string; sentToday: number; dailyLimit: number }[]> {
  const whereClause: Prisma.SESIdentityWhereInput = {
    status: { in: ['VERIFIED', 'WARMING', 'ACTIVE'] },
  };

  if (userId) {
    whereClause.userId = userId;
  }

  const identities = await prisma.sESIdentity.findMany({
    where: whereClause,
    select: {
      id: true,
      emailAddress: true,
      sentToday: true,
      dailyLimit: true,
    },
    orderBy: {
      sentToday: 'asc', // Prefer least-used identities
    },
  });

  // Filter to only those with remaining capacity
  return identities.filter((i) => i.sentToday < i.dailyLimit);
}

/**
 * Batch assign SES identities to emails using round-robin
 * Uses raw SQL for optimal performance with a single query
 * @param emailIds - Array of email IDs to assign identities to
 * @param userId - Optional user ID to filter identities
 * @returns Number of emails updated
 */
export async function batchAssignIdentities(
  emailIds: string[],
  userId?: string
): Promise<{ assignedCount: number; errors: string[] }> {
  const errors: string[] = [];

  if (emailIds.length === 0) {
    return { assignedCount: 0, errors: [] };
  }

  // Get available identities
  const identities = await getAvailableIdentities(userId);

  if (identities.length === 0) {
    errors.push('No available SES identities with remaining capacity');
    return { assignedCount: 0, errors };
  }

  // Build round-robin assignment using raw SQL CASE WHEN
  // This allows updating all emails in a single query
  const cases = emailIds
    .map((id, i) => {
      const identity = identities[i % identities.length];
      // Properly escape the UUIDs to prevent SQL injection
      return `WHEN id = '${id.replace(/'/g, "''")}' THEN '${identity.id.replace(/'/g, "''")}'`;
    })
    .join(' ');

  const idList = emailIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(',');

  try {
    const result = await prisma.$executeRawUnsafe(`
      UPDATE email_drafts
      SET ses_identity_id = CASE ${cases} END,
          updated_at = NOW()
      WHERE id IN (${idList})
        AND ses_identity_id IS NULL
    `);

    return { assignedCount: result, errors };
  } catch (error) {
    const errorMsg = `Failed to batch assign identities: ${error instanceof Error ? error.message : 'Unknown error'}`;
    errors.push(errorMsg);
    console.error(errorMsg, error);
    return { assignedCount: 0, errors };
  }
}

/**
 * Batch mark emails as sent with SES message IDs
 * @param updates - Array of {emailId, sesMessageId} pairs
 */
export async function batchMarkEmailsSent(
  updates: { emailId: string; sesMessageId: string }[]
): Promise<{ updatedCount: number }> {
  let updatedCount = 0;

  // Process in batches using transactions
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);

    await prisma.$transaction(
      batch.map(({ emailId, sesMessageId }) =>
        prisma.emailDraft.update({
          where: { id: emailId },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            sesMessageId,
          },
        })
      )
    );

    updatedCount += batch.length;
  }

  return { updatedCount };
}

/**
 * Get email IDs by campaign for bulk operations
 */
export async function getEmailIdsByCampaign(
  campaignId: string,
  options: {
    status?: EmailStatus | EmailStatus[];
    userId?: string;
    limit?: number;
  } = {}
): Promise<string[]> {
  const { status, userId, limit = 10000 } = options;

  const whereClause: Prisma.EmailDraftWhereInput = {
    business: {
      campaignId,
    },
  };

  if (status) {
    whereClause.status = Array.isArray(status) ? { in: status } : status;
  }

  if (userId) {
    whereClause.userId = userId;
  }

  const emails = await prisma.emailDraft.findMany({
    where: whereClause,
    select: { id: true },
    take: limit,
  });

  return emails.map((e) => e.id);
}

/**
 * Get count of emails by status for a campaign
 */
export async function getEmailCountsByStatus(
  campaignId?: string,
  userId?: string
): Promise<Record<EmailStatus, number>> {
  const whereClause: Prisma.EmailDraftWhereInput = {};

  if (campaignId) {
    whereClause.business = { campaignId };
  }

  if (userId) {
    whereClause.userId = userId;
  }

  const counts = await prisma.emailDraft.groupBy({
    by: ['status'],
    where: whereClause,
    _count: true,
  });

  // Initialize all statuses to 0
  const result: Record<string, number> = {
    DRAFT: 0,
    NEEDS_REVIEW: 0,
    APPROVED: 0,
    EXPORTED: 0,
    SENT: 0,
    REPLIED: 0,
    BOUNCED: 0,
    COMPLAINT: 0,
  };

  // Fill in actual counts
  for (const count of counts) {
    result[count.status] = count._count;
  }

  return result as Record<EmailStatus, number>;
}
