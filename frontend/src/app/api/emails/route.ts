import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFilter } from '@/lib/auth-utils';
import {
  createApiHandler,
  jsonResponse,
  getPaginationParams,
  buildPaginationMeta,
} from '@/lib/api-utils';

// GET /api/emails - List email drafts with filters
export const GET = createApiHandler(
  async (request: NextRequest, { logger, user }) => {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const industry = searchParams.get('industry');
    const campaignId = searchParams.get('campaignId');
    const minConfidence = searchParams.get('minConfidence');
    const maxConfidence = searchParams.get('maxConfidence');
    const minDeliverability = searchParams.get('minDeliverability');
    const maxDeliverability = searchParams.get('maxDeliverability');
    const date = searchParams.get('date'); // Filter by date (YYYY-MM-DD)
    const businessId = searchParams.get('businessId'); // Filter by business for thread view
    const filterUserId = searchParams.get('userId'); // Admin can filter by user

    const { page, limit, skip } = getPaginationParams(request);

    // Get user filter
    const userFilter = await getUserFilter(filterUserId);

    logger.debug('Fetching emails', {
      status,
      campaignId,
      page,
      limit,
      filterUserId: userFilter?.userId,
    });

    // Build where clause with user filter
    const where: Record<string, unknown> = {
      ...userFilter, // Apply user filter
    };

    // Campaign filter (via business relationship)
    if (campaignId) {
      where.business = {
        ...(where.business as Record<string, unknown> || {}),
        campaignId,
      };
    }

    if (status) {
      where.status = status.toUpperCase();
    }

    if (minConfidence || maxConfidence) {
      where.confidenceScore = {};
      if (minConfidence) (where.confidenceScore as Record<string, number>).gte = parseInt(minConfidence);
      if (maxConfidence) (where.confidenceScore as Record<string, number>).lte = parseInt(maxConfidence);
    }

    if (minDeliverability || maxDeliverability) {
      where.deliverabilityScore = {};
      if (minDeliverability) (where.deliverabilityScore as Record<string, number>).gte = parseInt(minDeliverability);
      if (maxDeliverability) (where.deliverabilityScore as Record<string, number>).lte = parseInt(maxDeliverability);
    }

    if (industry) {
      where.business = {
        industryGuess: {
          contains: industry,
          mode: 'insensitive',
        },
      };
    }

    // Date filter - filter by createdAt or sentAt date
    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);

      where.OR = [
        { createdAt: { gte: startDate, lte: endDate } },
        { sentAt: { gte: startDate, lte: endDate } },
      ];
    }

    // Business filter for thread view
    if (businessId) {
      where.businessId = businessId;
    }

    const [emails, total] = await Promise.all([
      prisma.emailDraft.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          business: {
            select: {
              id: true,
              canonicalName: true,
              industryGuess: true,
              website: true,
            },
          },
          contact: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
            },
          },
          events: {
            select: {
              id: true,
              eventType: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      }),
      prisma.emailDraft.count({ where }),
    ]);

    // Process emails to add tracking status summary
    const emailsWithStatus = emails.map((email) => {
      const eventTypes = new Set(email.events.map((e) => e.eventType));
      return {
        ...email,
        trackingStatus: {
          delivered: eventTypes.has('DELIVERED'),
          opened: eventTypes.has('OPEN'),
          clicked: eventTypes.has('CLICK'),
          bounced: eventTypes.has('BOUNCE'),
          complained: eventTypes.has('COMPLAINT'),
          replied: eventTypes.has('REPLY'),
        },
      };
    });

    logger.info('Emails fetched', { count: emails.length, total });

    return jsonResponse(
      {
        emails: emailsWithStatus,
        pagination: buildPaginationMeta(total, page, limit),
      },
      {
        cache: 'private, max-age=10, stale-while-revalidate=30',
      }
    );
  },
  { requireAuth: true }
);
