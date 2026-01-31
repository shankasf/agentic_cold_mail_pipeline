import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFilter, getUserIdForCreate } from '@/lib/auth-utils';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  getPaginationParams,
  buildPaginationMeta,
  Errors,
} from '@/lib/api-utils';

// GET /api/campaigns - List campaigns with search, status filter, pagination
export const GET = createApiHandler(
  async (request: NextRequest, { logger }) => {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const filterUserId = searchParams.get('userId');

    const { page, limit, skip } = getPaginationParams(request);

    const userFilter = await getUserFilter(filterUserId);

    logger.debug('Fetching campaigns', { search, status, page, limit });

    const where: Record<string, unknown> = {
      ...userFilter,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status.toUpperCase();
    }

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          _count: {
            select: {
              businesses: true,
              uploads: true,
            },
          },
        },
      }),
      prisma.campaign.count({ where }),
    ]);

    // Get email counts for each campaign (via businesses)
    const campaignsWithStats = await Promise.all(
      campaigns.map(async (campaign) => {
        const emailCount = await prisma.emailDraft.count({
          where: {
            business: {
              campaignId: campaign.id,
            },
          },
        });

        const contactCount = await prisma.contact.count({
          where: {
            business: {
              campaignId: campaign.id,
            },
          },
        });

        return {
          ...campaign,
          _count: {
            ...campaign._count,
            emails: emailCount,
            contacts: contactCount,
          },
        };
      })
    );

    logger.info('Campaigns fetched', { count: campaigns.length, total });

    return jsonResponse(
      {
        campaigns: campaignsWithStats,
        pagination: buildPaginationMeta(total, page, limit),
      },
      { cache: 'private, max-age=10, stale-while-revalidate=30' }
    );
  },
  { requireAuth: true }
);

// POST /api/campaigns - Create a new campaign
export const POST = createApiHandler(
  async (request: NextRequest, { logger }) => {
    const body = await parseJsonBody<{
      name: string;
      description?: string;
      status?: string;
    }>(request, logger);

    const { name, description, status } = body;

    if (!name || name.trim().length === 0) {
      throw Errors.badRequest('Campaign name is required', 'name');
    }

    const userId = await getUserIdForCreate();
    if (!userId) {
      throw Errors.unauthorized();
    }

    logger.debug('Creating campaign', { name: name.trim() });

    const campaign = await prisma.campaign.create({
      data: {
        userId,
        name: name.trim(),
        description: description?.trim() || null,
        status: status || 'DRAFT',
      },
      include: {
        _count: {
          select: {
            businesses: true,
            uploads: true,
          },
        },
      },
    });

    logger.info('Campaign created', { campaignId: campaign.id });

    return jsonResponse(campaign, { status: 201 });
  },
  { requireAuth: true }
);
