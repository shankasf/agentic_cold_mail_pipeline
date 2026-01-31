import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { startOfDay, subDays, format, parseISO, differenceInDays } from 'date-fns';
import { getCached, setCache, cacheKey, CACHE_TTL } from '@/lib/redis';
import { getUserFilter } from '@/lib/auth-utils';
import { createApiHandler, jsonResponse } from '@/lib/api-utils';

// GET /api/analytics - Get dashboard analytics with AWS SES metrics
export const GET = createApiHandler(
  async (request: NextRequest, { logger, user }) => {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '7');
    const filterUserId = searchParams.get('userId'); // Admin can filter by specific user
    const campaignId = searchParams.get('campaignId'); // Filter by campaign
    const startDateParam = searchParams.get('startDate'); // Custom date range start
    const endDateParam = searchParams.get('endDate'); // Custom date range end
    const statusFilter = searchParams.get('status'); // Filter by email status

    logger.debug('Fetching analytics', {
      days,
      filterUserId,
      campaignId,
      startDateParam,
      endDateParam,
      statusFilter,
    });

    const userFilter = await getUserFilter(filterUserId);
    const userIdForQuery = userFilter?.userId || null;

    // Determine date range
    let startDate: Date;
    let endDate: Date;
    let effectiveDays: number;

    if (startDateParam && endDateParam) {
      startDate = parseISO(startDateParam);
      endDate = parseISO(endDateParam);
      // Set end date to end of day
      endDate.setHours(23, 59, 59, 999);
      effectiveDays = differenceInDays(endDate, startDate) + 1;
    } else {
      startDate = subDays(new Date(), days);
      endDate = new Date();
      effectiveDays = days;
    }

    // Check cache (include all filter params in cache key)
    const cacheKeyStr = cacheKey.analytics(
      `${startDateParam || days}-${endDateParam || 'now'}-${userIdForQuery || 'all'}-${campaignId || 'all'}-${statusFilter || 'all'}`
    );
    const cached = await getCached<Record<string, unknown>>(cacheKeyStr);
    if (cached) {
      logger.debug('Returning cached analytics');
      return jsonResponse(cached, {
        headers: {
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
          'X-Cache': 'HIT',
        },
      });
    }

    const todayStart = startOfDay(new Date());

    // Format daily data structure
    const dailyData: Record<string, {
      generated: number;
      sent: number;
      delivered: number;
      opened: number;
      clicked: number;
      bounced: number;
      complaints: number;
    }> = {};

    for (let i = 0; i < effectiveDays; i++) {
      const date = format(subDays(endDate, i), 'yyyy-MM-dd');
      dailyData[date] = { generated: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complaints: 0 };
    }

    // Build where clause for user and campaign filtering
    const emailDraftWhere: Record<string, unknown> = userFilter ? { userId: userFilter.userId } : {};
    const businessWhere: Record<string, unknown> = userFilter ? { userId: userFilter.userId } : {};
    const uploadWhere: Record<string, unknown> = userFilter ? { userId: userFilter.userId } : {};

    // Add campaign filtering
    if (campaignId) {
      emailDraftWhere.business = { campaignId };
      businessWhere.campaignId = campaignId;
      uploadWhere.campaignId = campaignId;
    }

    // Add status filtering
    if (statusFilter) {
      emailDraftWhere.status = statusFilter;
    }

    // Execute ALL queries in parallel for maximum performance
    const [
      statusCounts,
      eventCounts,
      dailyEmailCounts,
      dailyEventCounts,
      todaySent,
      settings,
      suppressionCount,
      totalBusinesses,
      totalContacts,
      totalUploads,
      uniqueOpensResult,
      uniqueClicksResult,
    ] = await Promise.all([
      // Status breakdown (filtered by user)
      prisma.emailDraft.groupBy({
        by: ['status'],
        where: emailDraftWhere,
        _count: true,
      }),
      // Event counts for all time (join with email_drafts for user filter)
      userIdForQuery
        ? prisma.$queryRaw<Array<{ eventType: string; _count: number }>>`
            SELECT ee.event_type as "eventType", COUNT(*)::int as "_count"
            FROM email_events ee
            JOIN email_drafts ed ON ee.email_draft_id = ed.id
            WHERE ed.user_id = ${userIdForQuery}
            GROUP BY ee.event_type
          `
        : prisma.emailEvent.groupBy({
            by: ['eventType'],
            _count: true,
          }),
      // Daily email counts (filtered by user)
      userIdForQuery
        ? prisma.$queryRaw<Array<{
            date: string;
            generated: bigint;
            sent: bigint;
          }>>`
            SELECT
              DATE(created_at) as date,
              COUNT(*) as generated,
              COUNT(*) FILTER (WHERE status IN ('SENT', 'BOUNCED', 'COMPLAINT', 'REPLIED')) as sent
            FROM email_drafts
            WHERE created_at >= ${startDate} AND created_at <= ${endDate} AND user_id = ${userIdForQuery}
            GROUP BY DATE(created_at)
          `
        : prisma.$queryRaw<Array<{
            date: string;
            generated: bigint;
            sent: bigint;
          }>>`
            SELECT
              DATE(created_at) as date,
              COUNT(*) as generated,
              COUNT(*) FILTER (WHERE status IN ('SENT', 'BOUNCED', 'COMPLAINT', 'REPLIED')) as sent
            FROM email_drafts
            WHERE created_at >= ${startDate} AND created_at <= ${endDate}
            GROUP BY DATE(created_at)
          `,
      // Daily event counts (filtered by user through email_drafts join)
      userIdForQuery
        ? prisma.$queryRaw<Array<{
            date: string;
            event_type: string;
            count: bigint;
          }>>`
            SELECT
              DATE(ee.created_at) as date,
              ee.event_type,
              COUNT(*) as count
            FROM email_events ee
            JOIN email_drafts ed ON ee.email_draft_id = ed.id
            WHERE ee.created_at >= ${startDate} AND ee.created_at <= ${endDate} AND ed.user_id = ${userIdForQuery}
            GROUP BY DATE(ee.created_at), ee.event_type
          `
        : prisma.$queryRaw<Array<{
            date: string;
            event_type: string;
            count: bigint;
          }>>`
            SELECT
              DATE(created_at) as date,
              event_type,
              COUNT(*) as count
            FROM email_events
            WHERE created_at >= ${startDate} AND created_at <= ${endDate}
            GROUP BY DATE(created_at), event_type
          `,
      // Today's sent count (filtered by user)
      prisma.emailDraft.count({
        where: {
          ...emailDraftWhere,
          status: { in: ['SENT', 'BOUNCED', 'COMPLAINT', 'REPLIED'] },
          updatedAt: { gte: todayStart },
        },
      }),
      // Admin settings
      prisma.adminSettings.findFirst(),
      // Suppression list count (global)
      prisma.suppressionList.count(),
      // Total counts (filtered by user and campaign)
      prisma.business.count({ where: businessWhere }),
      prisma.contact.count({
        where: {
          business: {
            ...(userIdForQuery && { userId: userIdForQuery }),
            ...(campaignId && { campaignId }),
          },
        },
      }),
      prisma.upload.count({ where: uploadWhere }),
      // Unique opens (filtered by user)
      userIdForQuery
        ? prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(DISTINCT ee.email_draft_id) as count
            FROM email_events ee
            JOIN email_drafts ed ON ee.email_draft_id = ed.id
            WHERE ee.event_type = 'OPEN' AND ed.user_id = ${userIdForQuery}
          `
        : prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(DISTINCT email_draft_id) as count FROM email_events WHERE event_type = 'OPEN'
          `,
      // Unique clicks (filtered by user)
      userIdForQuery
        ? prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(DISTINCT ee.email_draft_id) as count
            FROM email_events ee
            JOIN email_drafts ed ON ee.email_draft_id = ed.id
            WHERE ee.event_type = 'CLICK' AND ed.user_id = ${userIdForQuery}
          `
        : prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(DISTINCT email_draft_id) as count FROM email_events WHERE event_type = 'CLICK'
          `,
    ]);

    // Process status counts
    const statusMap: Record<string, number> = {};
    for (const item of statusCounts) {
      statusMap[item.status] = item._count;
    }

    // Process daily email counts
    for (const row of dailyEmailCounts) {
      const dateStr = format(new Date(row.date), 'yyyy-MM-dd');
      if (dailyData[dateStr]) {
        dailyData[dateStr].generated = Number(row.generated);
        dailyData[dateStr].sent = Number(row.sent);
      }
    }

    // Process daily event counts
    for (const row of dailyEventCounts) {
      const dateStr = format(new Date(row.date), 'yyyy-MM-dd');
      if (dailyData[dateStr]) {
        switch (row.event_type) {
          case 'DELIVERED': dailyData[dateStr].delivered = Number(row.count); break;
          case 'OPEN': dailyData[dateStr].opened = Number(row.count); break;
          case 'CLICK': dailyData[dateStr].clicked = Number(row.count); break;
          case 'BOUNCE': dailyData[dateStr].bounced = Number(row.count); break;
          case 'COMPLAINT': dailyData[dateStr].complaints = Number(row.count); break;
        }
      }
    }

    // Process event counts
    const eventMap: Record<string, number> = {};
    for (const item of eventCounts) {
      eventMap[item.eventType] = item._count;
    }

    // Calculate delivery metrics (AWS SES style)
    const totalSent = eventMap['SENT'] || 0;
    const totalDelivered = eventMap['DELIVERED'] || 0;
    const totalOpened = eventMap['OPEN'] || 0;
    const totalClicked = eventMap['CLICK'] || 0;
    const totalBounced = eventMap['BOUNCE'] || 0;
    const totalComplaints = eventMap['COMPLAINT'] || 0;
    const totalDelayedDelivery = eventMap['DELIVERY_DELAY'] || 0;
    const totalRejected = eventMap['REJECT'] || 0;

    // Calculate rates (avoid division by zero)
    const deliveryRate = totalSent > 0 ? ((totalDelivered / totalSent) * 100).toFixed(1) : '0';
    const openRate = totalDelivered > 0 ? ((totalOpened / totalDelivered) * 100).toFixed(1) : '0';
    const clickRate = totalOpened > 0 ? ((totalClicked / totalOpened) * 100).toFixed(1) : '0';
    const clickThroughRate = totalDelivered > 0 ? ((totalClicked / totalDelivered) * 100).toFixed(1) : '0';
    const bounceRate = totalSent > 0 ? ((totalBounced / totalSent) * 100).toFixed(1) : '0';
    const complaintRate = totalDelivered > 0 ? ((totalComplaints / totalDelivered) * 100).toFixed(2) : '0';

    // Get daily cap from settings
    const dailyCap = settings?.sendingCapPerDay ?? 100;

    // Get unique counts
    const uniqueOpensCount = Number(uniqueOpensResult[0]?.count || 0);
    const uniqueClicksCount = Number(uniqueClicksResult[0]?.count || 0);

    const responseData = {
      overview: {
        totalEmails: statusCounts.reduce((sum, item) => sum + item._count, 0),
        totalBusinesses,
        totalContacts,
        totalUploads,
        suppressionCount,
      },
      statusBreakdown: statusMap,
      events: eventMap,
      // AWS SES style delivery metrics
      deliveryMetrics: {
        sent: totalSent,
        delivered: totalDelivered,
        deliveryRate: parseFloat(deliveryRate),
        bounced: totalBounced,
        bounceRate: parseFloat(bounceRate),
        rejected: totalRejected,
        delayed: totalDelayedDelivery,
      },
      // Engagement metrics
      engagementMetrics: {
        opens: totalOpened,
        uniqueOpens: uniqueOpensCount,
        openRate: parseFloat(openRate),
        clicks: totalClicked,
        uniqueClicks: uniqueClicksCount,
        clickRate: parseFloat(clickRate),
        clickThroughRate: parseFloat(clickThroughRate),
      },
      // Reputation metrics
      reputationMetrics: {
        complaints: totalComplaints,
        complaintRate: parseFloat(complaintRate),
        suppressedEmails: suppressionCount,
      },
      // Delivery funnel for visualization
      deliveryFunnel: [
        { stage: 'Sent', count: totalSent },
        { stage: 'Delivered', count: totalDelivered },
        { stage: 'Opened', count: totalOpened },
        { stage: 'Clicked', count: totalClicked },
      ],
      sendingStatus: {
        sentToday: todaySent,
        dailyCap,
        remaining: Math.max(0, dailyCap - todaySent),
      },
      dailyTrend: Object.entries(dailyData)
        .map(([date, data]) => ({
          date,
          ...data,
        }))
        .reverse(),
    };

    // Cache the result
    await setCache(cacheKeyStr, responseData, CACHE_TTL.ANALYTICS);

    logger.info('Analytics fetched successfully', {
      userId: user?.id,
      effectiveDays,
      totalEmails: responseData.overview.totalEmails,
    });

    return jsonResponse(responseData, {
      headers: {
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
        'X-Cache': 'MISS',
      },
    });
  },
  { requireAuth: true }
);
