import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFilter } from '@/lib/auth-utils';
import {
  createApiHandler,
  jsonResponse,
  getPaginationParams,
  buildPaginationMeta,
} from '@/lib/api-utils';

// Map tracking filter values to event types
const TRACKING_EVENT_MAP: Record<string, string> = {
  delivered: 'DELIVERED',
  opened: 'OPEN',
  clicked: 'CLICK',
  replied: 'REPLY',
  bounced: 'BOUNCE',
};

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
    const dateFrom = searchParams.get('dateFrom'); // Date range start
    const dateTo = searchParams.get('dateTo'); // Date range end
    const businessId = searchParams.get('businessId'); // Filter by business for thread view
    const filterUserId = searchParams.get('userId'); // Admin can filter by user
    const tracking = searchParams.get('tracking'); // Filter by tracking status: opened, clicked, replied, delivered, bounced, not_opened, not_clicked
    const search = searchParams.get('search'); // Search by subject or contact email
    const fromEmail = searchParams.get('fromEmail'); // Filter by sender identity
    const hasReplies = searchParams.get('hasReplies'); // Filter emails with replies

    const { page, limit, skip } = getPaginationParams(request);

    // Get user filter
    const userFilter = await getUserFilter(filterUserId);

    logger.debug('Fetching emails', {
      status,
      campaignId,
      tracking,
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
        ...(where.business as Record<string, unknown> || {}),
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

    // Date range filter
    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (dateFrom) {
        const startDate = new Date(dateFrom);
        startDate.setHours(0, 0, 0, 0);
        dateFilter.gte = startDate;
      }
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        dateFilter.lte = endDate;
      }
      // Apply to createdAt (or sentAt for sent emails)
      if (!where.OR) {
        where.createdAt = dateFilter;
      }
    }

    // Business filter for thread view
    if (businessId) {
      where.businessId = businessId;
    }

    // Sender identity filter
    if (fromEmail) {
      where.fromEmail = fromEmail;
    }

    // Has replies filter
    if (hasReplies === 'true') {
      where.events = {
        ...(where.events as Record<string, unknown> || {}),
        some: {
          eventType: 'REPLY',
        },
      };
    } else if (hasReplies === 'false') {
      where.events = {
        ...(where.events as Record<string, unknown> || {}),
        none: {
          eventType: 'REPLY',
        },
      };
    }

    // Search filter - search by subject or contact email
    if (search) {
      const searchConditions = [
        { subject: { contains: search, mode: 'insensitive' as const } },
        { contact: { email: { contains: search, mode: 'insensitive' as const } } },
        { contact: { name: { contains: search, mode: 'insensitive' as const } } },
        { business: { canonicalName: { contains: search, mode: 'insensitive' as const } } },
      ];

      // If there's already an OR condition (from date filter), we need to combine them with AND
      if (where.OR) {
        where.AND = [
          { OR: where.OR as Record<string, unknown>[] },
          { OR: searchConditions },
        ];
        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
    }

    // Tracking status filter - filter by email events
    if (tracking) {
      // Handle "engaged" composite filter (any interaction)
      if (tracking === 'engaged') {
        where.events = {
          some: {
            eventType: { in: ['OPEN', 'CLICK', 'REPLY'] },
          },
        };
      }
      // Handle "not_engaged" - sent but no interactions
      else if (tracking === 'not_engaged') {
        where.status = 'SENT';
        where.events = {
          none: {
            eventType: { in: ['OPEN', 'CLICK', 'REPLY'] },
          },
        };
      }
      // Handle negative filters (not_opened, not_clicked)
      else if (tracking.startsWith('not_')) {
        const eventType = TRACKING_EVENT_MAP[tracking.replace('not_', '')];
        if (eventType) {
          where.status = 'SENT'; // Only applies to sent emails
          where.events = {
            none: {
              eventType: eventType,
            },
          };
        }
      }
      // Handle positive filters (opened, clicked, replied, delivered, bounced)
      else if (TRACKING_EVENT_MAP[tracking]) {
        where.events = {
          some: {
            eventType: TRACKING_EVENT_MAP[tracking],
          },
        };
      }
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
