import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFilter, getCurrentUser } from '@/lib/auth-utils';
import { startOfDay } from 'date-fns';
import { Logger } from '@/lib/logger';

// Force dynamic rendering for SSE
export const dynamic = 'force-dynamic';

// SSE endpoint for real-time sidebar counts
export async function GET(request: NextRequest) {
  const logger = new Logger();

  // Verify auth
  const user = await getCurrentUser();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();
  let isActive = true;

  const stream = new ReadableStream({
    async start(controller) {
      const sendCounts = async () => {
        if (!isActive) return;

        try {
          const userFilter = await getUserFilter();
          const todayStart = startOfDay(new Date());

          const [
            activeCampaigns,
            newCompaniesToday,
            emailsNeedingReview,
            pendingEmails,
            unreadInbox,
            processingUploads,
            engagedLeads,
          ] = await Promise.all([
            prisma.campaign.count({
              where: { ...userFilter, status: 'ACTIVE' },
            }),
            prisma.business.count({
              where: { ...userFilter, createdAt: { gte: todayStart } },
            }),
            prisma.emailDraft.count({
              where: { ...userFilter, status: 'NEEDS_REVIEW' },
            }),
            prisma.emailDraft.count({
              where: { ...userFilter, status: { in: ['DRAFT', 'APPROVED'] } },
            }),
            prisma.inboundEmail.count({
              where: { isRead: false, business: userFilter },
            }),
            prisma.upload.count({
              where: { ...userFilter, status: 'QUEUED' },
            }),
            prisma.$queryRaw<{ count: bigint }[]>`
              SELECT COUNT(DISTINCT c.id) as count
              FROM contacts c
              JOIN email_drafts ed ON ed.contact_id = c.id
              JOIN email_events ee ON ee.email_draft_id = ed.id
              WHERE ee.event_type IN ('OPEN', 'CLICK', 'REPLY')
            `.then(result => Number(result[0]?.count || 0)),
          ]);

          const data = {
            campaigns: activeCampaigns,
            companies: newCompaniesToday,
            emails: emailsNeedingReview,
            pendingEmails,
            inbox: unreadInbox,
            uploads: processingUploads,
            leads: engagedLeads,
            timestamp: Date.now(),
          };

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch (error) {
          logger.error('Error fetching counts for SSE', { error });
        }
      };

      // Send initial counts immediately
      await sendCounts();

      // Set up interval for periodic updates (every 5 seconds for more real-time feel)
      const interval = setInterval(sendCounts, 5000);

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        isActive = false;
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
