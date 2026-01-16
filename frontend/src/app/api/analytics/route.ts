import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { startOfDay, subDays, format } from 'date-fns';

// GET /api/analytics - Get dashboard analytics with AWS SES metrics
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '7');

    const startDate = subDays(new Date(), days);

    // Get counts by status
    const statusCounts = await prisma.emailDraft.groupBy({
      by: ['status'],
      _count: true,
    });

    const statusMap: Record<string, number> = {};
    for (const item of statusCounts) {
      statusMap[item.status] = item._count;
    }

    // Format daily data
    const dailyData: Record<string, {
      generated: number;
      sent: number;
      delivered: number;
      opened: number;
      clicked: number;
      bounced: number;
      complaints: number;
    }> = {};

    for (let i = 0; i < days; i++) {
      const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
      dailyData[date] = { generated: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complaints: 0 };
    }

    // Get daily breakdown by status
    const emailsByDay = await prisma.emailDraft.findMany({
      where: {
        createdAt: { gte: startDate },
      },
      select: {
        createdAt: true,
        status: true,
      },
    });

    for (const email of emailsByDay) {
      const date = format(email.createdAt, 'yyyy-MM-dd');
      if (dailyData[date]) {
        dailyData[date].generated++;
        if (['SENT', 'BOUNCED', 'COMPLAINT', 'REPLIED'].includes(email.status)) {
          dailyData[date].sent++;
        }
      }
    }

    // Get daily events for detailed tracking
    const eventsByDay = await prisma.emailEvent.findMany({
      where: {
        createdAt: { gte: startDate },
      },
      select: {
        createdAt: true,
        eventType: true,
      },
    });

    for (const event of eventsByDay) {
      const date = format(event.createdAt, 'yyyy-MM-dd');
      if (dailyData[date]) {
        switch (event.eventType) {
          case 'DELIVERED': dailyData[date].delivered++; break;
          case 'OPEN': dailyData[date].opened++; break;
          case 'CLICK': dailyData[date].clicked++; break;
          case 'BOUNCE': dailyData[date].bounced++; break;
          case 'COMPLAINT': dailyData[date].complaints++; break;
        }
      }
    }

    // Get event counts for all time
    const eventCounts = await prisma.emailEvent.groupBy({
      by: ['eventType'],
      _count: true,
    });

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

    // Get today's sending count
    const todayStart = startOfDay(new Date());
    const todaySent = await prisma.emailDraft.count({
      where: {
        status: { in: ['SENT', 'BOUNCED', 'COMPLAINT', 'REPLIED'] },
        updatedAt: { gte: todayStart },
      },
    });

    // Get admin settings for cap
    const settings = await prisma.adminSettings.findFirst();
    const dailyCap = settings?.sendingCapPerDay ?? 100;

    // Get suppression list count
    const suppressionCount = await prisma.suppressionList.count();

    // Get total counts
    const totalBusinesses = await prisma.business.count();
    const totalContacts = await prisma.contact.count();
    const totalUploads = await prisma.upload.count();

    // Get unique opens/clicks (distinct email drafts)
    const uniqueOpens = await prisma.emailEvent.groupBy({
      by: ['emailDraftId'],
      where: { eventType: 'OPEN' },
    });
    const uniqueClicks = await prisma.emailEvent.groupBy({
      by: ['emailDraftId'],
      where: { eventType: 'CLICK' },
    });

    return NextResponse.json({
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
        uniqueOpens: uniqueOpens.length,
        openRate: parseFloat(openRate),
        clicks: totalClicked,
        uniqueClicks: uniqueClicks.length,
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
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}
