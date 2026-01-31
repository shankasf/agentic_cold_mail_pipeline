import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFilter } from '@/lib/auth-utils';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  Errors,
} from '@/lib/api-utils';

// GET /api/campaigns/[id] - Get campaign details with stats
export const GET = createApiHandler(
  async (request: NextRequest, { logger, params }) => {
    const { id } = params;
    const userFilter = await getUserFilter();

    logger.debug('Fetching campaign', { campaignId: id });

    const campaign = await prisma.campaign.findFirst({
      where: {
        id,
        ...userFilter,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        _count: {
          select: {
            businesses: true,
            uploads: true,
          },
        },
      },
    });

    if (!campaign) {
      throw Errors.notFound('Campaign');
    }

    // Get additional stats
    const [emailStats, contactCount, recentBusinesses] = await Promise.all([
      prisma.emailDraft.groupBy({
        by: ['status'],
        where: {
          business: {
            campaignId: id,
          },
        },
        _count: true,
      }),
      prisma.contact.count({
        where: {
          business: {
            campaignId: id,
          },
        },
      }),
      prisma.business.findMany({
        where: { campaignId: id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          canonicalName: true,
          industryGuess: true,
          createdAt: true,
          _count: {
            select: {
              contacts: true,
              emailDrafts: true,
            },
          },
        },
      }),
    ]);

    // Calculate email status breakdown
    const emailStatusBreakdown: Record<string, number> = {};
    let totalEmails = 0;
    for (const stat of emailStats) {
      emailStatusBreakdown[stat.status] = stat._count;
      totalEmails += stat._count;
    }

    logger.debug('Campaign fetched successfully', { campaignId: id });

    return jsonResponse({
      ...campaign,
      stats: {
        totalBusinesses: campaign._count.businesses,
        totalContacts: contactCount,
        totalEmails,
        totalUploads: campaign._count.uploads,
        emailStatusBreakdown,
      },
      recentBusinesses,
    });
  },
  { requireAuth: true }
);

// PATCH /api/campaigns/[id] - Update campaign
export const PATCH = createApiHandler(
  async (request: NextRequest, { logger, params }) => {
    const { id } = params;
    const userFilter = await getUserFilter();
    const body = await parseJsonBody<{
      name?: string;
      description?: string;
      status?: string;
    }>(request, logger);

    logger.debug('Updating campaign', { campaignId: id });

    // Check campaign exists and user has access
    const existing = await prisma.campaign.findFirst({
      where: {
        id,
        ...userFilter,
      },
    });

    if (!existing) {
      throw Errors.notFound('Campaign');
    }

    const { name, description, status } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (status !== undefined) updateData.status = status;

    const campaign = await prisma.campaign.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: {
            businesses: true,
            uploads: true,
          },
        },
      },
    });

    logger.info('Campaign updated', { campaignId: id });

    return jsonResponse(campaign);
  },
  { requireAuth: true }
);

// DELETE /api/campaigns/[id] - Delete campaign (orphans businesses)
export const DELETE = createApiHandler(
  async (request: NextRequest, { logger, params }) => {
    const { id } = params;
    const userFilter = await getUserFilter();

    logger.debug('Deleting campaign', { campaignId: id });

    // Check campaign exists and user has access
    const existing = await prisma.campaign.findFirst({
      where: {
        id,
        ...userFilter,
      },
    });

    if (!existing) {
      throw Errors.notFound('Campaign');
    }

    // Delete campaign - businesses and uploads will be orphaned (campaignId set to null via onDelete: SetNull)
    await prisma.campaign.delete({
      where: { id },
    });

    logger.info('Campaign deleted', { campaignId: id });

    return jsonResponse({
      message: 'Campaign deleted successfully',
    });
  },
  { requireAuth: true }
);
