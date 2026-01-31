import { createApiHandler, jsonResponse } from '@/lib/api-utils';
import prisma from '@/lib/prisma';
import { getUserFilter } from '@/lib/auth-utils';
import { startOfDay } from 'date-fns';

// GET /api/sidebar-counts - Get counts for sidebar badges
export const GET = createApiHandler(
  async (request, { logger, requestId }) => {
    logger.debug('Fetching sidebar counts');

    const userFilter = await getUserFilter();
    const todayStart = startOfDay(new Date());

    // Run all counts in parallel for performance
    const [
      activeCampaigns,
      newCompaniesToday,
      emailsNeedingReview,
      pendingEmails,
      unreadInbox,
      processingUploads,
      engagedLeads,
    ] = await Promise.all([
      // Active campaigns
      prisma.campaign.count({
        where: {
          ...userFilter,
          status: 'ACTIVE',
        },
      }),

      // Companies added today
      prisma.business.count({
        where: {
          ...userFilter,
          createdAt: { gte: todayStart },
        },
      }),

      // Emails needing review
      prisma.emailDraft.count({
        where: {
          ...userFilter,
          status: 'NEEDS_REVIEW',
        },
      }),

      // Pending/draft emails ready to send
      prisma.emailDraft.count({
        where: {
          ...userFilter,
          status: { in: ['DRAFT', 'APPROVED'] },
        },
      }),

      // Unread inbound emails
      prisma.inboundEmail.count({
        where: {
          isRead: false,
          business: userFilter,
        },
      }),

      // Processing uploads
      prisma.upload.count({
        where: {
          ...userFilter,
          status: 'QUEUED',
        },
      }),

      // Engaged leads (contacts who opened emails)
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT c.id) as count
        FROM contacts c
        JOIN email_drafts ed ON ed.contact_id = c.id
        JOIN email_events ee ON ee.email_draft_id = ed.id
        WHERE ee.event_type IN ('OPEN', 'CLICK', 'REPLY')
      `.then(result => Number(result[0]?.count || 0)),
    ]);

    logger.info('Sidebar counts fetched', {
      campaigns: activeCampaigns,
      companies: newCompaniesToday,
      emails: emailsNeedingReview,
    });

    return jsonResponse({
      campaigns: activeCampaigns,
      companies: newCompaniesToday,
      emails: emailsNeedingReview,
      pendingEmails,
      inbox: unreadInbox,
      uploads: processingUploads,
      leads: engagedLeads,
    }, {
      requestId,
      cache: 'private, max-age=30, stale-while-revalidate=60',
    });
  },
  { requireAuth: true }
);
