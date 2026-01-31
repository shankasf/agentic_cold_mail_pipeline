import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { addEmailSendJob } from '@/lib/queue';
import { startOfDay } from 'date-fns';
import { distributeEmailsAcrossIdentities, getTotalAvailableQuota } from '@/lib/email-sender';
import { createApiHandler, jsonResponse, parseJsonBody, Errors } from '@/lib/api-utils';

// POST /api/emails/send - Queue approved emails for sending
export const POST = createApiHandler(
  async (request: NextRequest, { logger }) => {
    const body = await parseJsonBody<{
      emailIds?: string[];
      approveFirst?: boolean;
    }>(request, logger);

    const { emailIds, approveFirst } = body;

    logger.debug('Processing send request', {
      emailCount: emailIds?.length,
      approveFirst,
    });

    // Get admin settings for cap
    const settings = await prisma.adminSettings.findFirst();
    const dailyCap = settings?.sendingCapPerDay ?? 100;

    // Check today's sent count
    const todayStart = startOfDay(new Date());
    const sentToday = await prisma.emailDraft.count({
      where: {
        status: 'SENT',
        updatedAt: { gte: todayStart },
      },
    });

    const remaining = dailyCap - sentToday;

    if (remaining <= 0) {
      throw Errors.badRequest('Daily sending cap reached');
    }

    // Check available identity quota
    const quotaInfo = await getTotalAvailableQuota();
    if (quotaInfo.totalRemaining <= 0) {
      throw Errors.badRequest('All sending identities have reached their daily limits. Try again tomorrow.');
    }

    // If approveFirst is true, first approve the specified emails
    if (approveFirst && emailIds && emailIds.length > 0) {
      const approved = await prisma.emailDraft.updateMany({
        where: {
          id: { in: emailIds },
          status: { in: ['DRAFT', 'NEEDS_REVIEW'] },
        },
        data: { status: 'APPROVED' },
      });
      logger.debug('Approved emails', { count: approved.count });
    }

    // Get approved emails not in suppression list
    // IMPORTANT: Only select APPROVED emails - never resend SENT, BOUNCED, or COMPLAINT
    const where: Record<string, unknown> = {
      status: 'APPROVED',
      // Exclude already sent emails (extra safety check)
      sentAt: null,
    };

    if (emailIds && emailIds.length > 0) {
      // Filter to only include requested IDs that are APPROVED
      where.id = { in: emailIds };
    }

    // Limit by both admin cap and identity quota
    const maxToSend = Math.min(remaining, quotaInfo.totalRemaining);

    const emails = await prisma.emailDraft.findMany({
      where,
      include: { contact: true },
      take: maxToSend,
    });

    // Filter out suppressed emails
    const suppressedEmails = await prisma.suppressionList.findMany({
      where: {
        email: { in: emails.map((e) => e.contact.email) },
      },
    });
    const suppressedSet = new Set(suppressedEmails.map((s) => s.email));

    const eligibleEmails = emails.filter((e) => !suppressedSet.has(e.contact.email));

    if (eligibleEmails.length === 0) {
      logger.info('No eligible emails to send', {
        total: emails.length,
        suppressed: emails.length,
      });

      return jsonResponse({
        message: 'No eligible emails to send',
        queued: 0,
        skippedSuppressed: emails.length,
      });
    }

    // Pre-distribute emails evenly across available identities
    const distribution = await distributeEmailsAcrossIdentities(
      eligibleEmails.map(e => e.id)
    );

    // Update email drafts with their assigned identities
    for (const [emailId, assignment] of distribution.assignments) {
      await prisma.emailDraft.update({
        where: { id: emailId },
        data: {
          fromEmail: assignment.fromEmail,
          fromName: assignment.fromName,
          sesIdentityId: assignment.identityId,
        },
      });
    }

    // Queue assigned emails for sending
    let queued = 0;
    for (const emailId of distribution.assignments.keys()) {
      await addEmailSendJob({ emailDraftId: emailId });
      queued++;
    }

    logger.info('Emails queued for sending', {
      queued,
      skippedSuppressed: emails.length - eligibleEmails.length,
      skippedNoQuota: distribution.unassigned.length,
    });

    return jsonResponse({
      message: `Queued ${queued} emails for sending`,
      queued,
      skippedSuppressed: emails.length - eligibleEmails.length,
      skippedNoQuota: distribution.unassigned.length,
      identityDistribution: distribution.quotaInfo.identityBreakdown,
    });
  },
  { requireAuth: true }
);
