import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { startOfDay, subDays, format } from 'date-fns';

// GET /api/analytics - Get dashboard analytics
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

    // Get daily generation counts
    const dailyGenerated = await prisma.emailDraft.groupBy({
      by: ['createdAt'],
      where: {
        createdAt: { gte: startDate },
      },
      _count: true,
    });

    // Format daily data
    const dailyData: Record<string, { generated: number; needsReview: number; approved: number; sent: number }> = {};

    for (let i = 0; i < days; i++) {
      const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
      dailyData[date] = { generated: 0, needsReview: 0, approved: 0, sent: 0 };
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
        if (email.status === 'NEEDS_REVIEW') dailyData[date].needsReview++;
        if (email.status === 'APPROVED') dailyData[date].approved++;
        if (email.status === 'SENT') dailyData[date].sent++;
      }
    }

    // Get event counts
    const eventCounts = await prisma.emailEvent.groupBy({
      by: ['eventType'],
      _count: true,
    });

    const eventMap: Record<string, number> = {};
    for (const item of eventCounts) {
      eventMap[item.eventType] = item._count;
    }

    // Get today's sending count
    const todayStart = startOfDay(new Date());
    const todaySent = await prisma.emailDraft.count({
      where: {
        status: 'SENT',
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
