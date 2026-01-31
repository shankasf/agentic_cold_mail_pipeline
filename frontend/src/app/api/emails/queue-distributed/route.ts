import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { addEmailSendJob } from '@/lib/queue';
import { startOfDay } from 'date-fns';
import {
  distributeEmailsAcrossIdentities,
  assignIdentityToEmailDraft,
  getTotalAvailableQuota,
} from '@/lib/email-sender';
import { getUserFilter } from '@/lib/auth-utils';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  Errors,
} from '@/lib/api-utils';

/**
 * POST /api/emails/queue-distributed
 *
 * Smart email queuing that automatically distributes emails across all
 * available SES identities based on their remaining daily quota.
 *
 * Request body:
 * - emailIds?: string[] - Specific email IDs to queue (optional)
 * - approveFirst?: boolean - Approve drafts before queuing
 * - maxEmails?: number - Maximum emails to queue (default: all available)
 *
 * This endpoint:
 * 1. Gets all approved emails (or specified IDs)
 * 2. Filters out suppressed emails
 * 3. Distributes emails across all SES identities based on quota
 * 4. Updates each email with assigned identity
 * 5. Queues them for sending
 */
export const POST = createApiHandler(
  async (request: NextRequest, { logger }) => {
    const body = await parseJsonBody<{
      emailIds?: string[];
      approveFirst?: boolean;
      maxEmails?: number;
    }>(request, logger);

    const { emailIds, approveFirst, maxEmails } = body;

    logger.debug('Queue distributed emails request', {
      emailIds: emailIds?.length,
      approveFirst,
      maxEmails
    });

    // Get user filter (non-admins can only queue their own emails)
    const userFilter = await getUserFilter();

    // Get quota info first
    const quotaInfo = await getTotalAvailableQuota();
    if (quotaInfo.totalRemaining === 0) {
      throw Errors.badRequest('No sending quota available. All SES identities have reached their daily limits');
    }

    // Get admin settings for global cap
    const settings = await prisma.adminSettings.findFirst();
    const dailyCap = settings?.sendingCapPerDay ?? 100;

    // Check today's global sent count
    const todayStart = startOfDay(new Date());
    const sentToday = await prisma.emailDraft.count({
      where: {
        status: 'SENT',
        updatedAt: { gte: todayStart },
      },
    });

    const globalRemaining = dailyCap - sentToday;
    if (globalRemaining <= 0) {
      throw Errors.badRequest('Global daily sending cap reached');
    }

    // If approveFirst is true, first approve the specified emails
    if (approveFirst && emailIds && emailIds.length > 0) {
      await prisma.emailDraft.updateMany({
        where: {
          id: { in: emailIds },
          status: { in: ['DRAFT', 'NEEDS_REVIEW'] },
          ...userFilter,
        },
        data: { status: 'APPROVED' },
      });
    }

    // Get approved emails
    const whereClause: Record<string, unknown> = {
      status: 'APPROVED',
      ...userFilter,
    };

    if (emailIds && emailIds.length > 0) {
      whereClause.id = { in: emailIds };
    }

    // Calculate max emails to queue (minimum of global cap, identity quota, and user-specified max)
    const effectiveMax = Math.min(
      globalRemaining,
      quotaInfo.totalRemaining,
      maxEmails || Infinity
    );

    const emails = await prisma.emailDraft.findMany({
      where: whereClause,
      include: { contact: true },
      take: effectiveMax,
      orderBy: { createdAt: 'asc' }, // FIFO - oldest first
    });

    if (emails.length === 0) {
      logger.info('No approved emails to queue');
      return jsonResponse({
        message: 'No approved emails to queue',
        queued: 0,
        quotaAvailable: quotaInfo,
      });
    }

    // Filter out suppressed emails
    const suppressedEmails = await prisma.suppressionList.findMany({
      where: {
        email: { in: emails.map((e) => e.contact.email) },
      },
    });
    const suppressedSet = new Set(suppressedEmails.map((s) => s.email));

    const eligibleEmails = emails.filter((e) => !suppressedSet.has(e.contact.email));

    if (eligibleEmails.length === 0) {
      logger.info('All selected emails are in suppression list');
      return jsonResponse({
        message: 'All selected emails are in suppression list',
        queued: 0,
        skippedSuppressed: emails.length,
      });
    }

    // Distribute emails across identities
    const distribution = await distributeEmailsAcrossIdentities(
      eligibleEmails.map(e => e.id)
    );

    // Update each email with its assigned identity and queue for sending
    let queued = 0;
    const queuedByIdentity: Record<string, number> = {};

    for (const [emailId, assignment] of distribution.assignments) {
      // Update email draft with assigned identity
      await assignIdentityToEmailDraft(
        emailId,
        assignment.identityId,
        assignment.fromEmail,
        assignment.fromName
      );

      // Queue for sending
      await addEmailSendJob({ emailDraftId: emailId });
      queued++;

      // Track by identity
      queuedByIdentity[assignment.fromEmail] = (queuedByIdentity[assignment.fromEmail] || 0) + 1;
    }

    logger.info('Emails queued for distributed sending', {
      queued,
      identitiesUsed: Object.keys(queuedByIdentity).length
    });

    return jsonResponse({
      message: `Queued ${queued} emails distributed across ${Object.keys(queuedByIdentity).length} sender identities`,
      queued,
      skippedSuppressed: emails.length - eligibleEmails.length,
      skippedNoQuota: distribution.unassigned.length,
      distribution: {
        byIdentity: queuedByIdentity,
        totalIdentitiesUsed: Object.keys(queuedByIdentity).length,
      },
      quotaRemaining: {
        global: globalRemaining - queued,
        byIdentity: quotaInfo.identities.map(i => ({
          email: i.email,
          remaining: i.remaining - (queuedByIdentity[i.email] || 0),
        })),
      },
    });
  },
  { requireAuth: true }
);

/**
 * GET /api/emails/queue-distributed
 *
 * Get current quota status for distributed sending
 */
export const GET = createApiHandler(
  async (request: NextRequest, { logger }) => {
    logger.debug('Fetching quota status');

    const quotaInfo = await getTotalAvailableQuota();

    // Get global cap info
    const settings = await prisma.adminSettings.findFirst();
    const dailyCap = settings?.sendingCapPerDay ?? 100;

    const todayStart = startOfDay(new Date());
    const sentToday = await prisma.emailDraft.count({
      where: {
        status: 'SENT',
        updatedAt: { gte: todayStart },
      },
    });

    // Get pending approved emails count
    const userFilter = await getUserFilter();
    const pendingApproved = await prisma.emailDraft.count({
      where: {
        status: 'APPROVED',
        ...userFilter,
      },
    });

    logger.info('Quota status fetched', {
      dailyCap,
      sentToday,
      pendingApproved
    });

    return jsonResponse({
      globalQuota: {
        dailyCap,
        sentToday,
        remaining: dailyCap - sentToday,
      },
      identityQuota: quotaInfo,
      pendingApproved,
      canSend: Math.min(dailyCap - sentToday, quotaInfo.totalRemaining),
    });
  },
  { requireAuth: true }
);
