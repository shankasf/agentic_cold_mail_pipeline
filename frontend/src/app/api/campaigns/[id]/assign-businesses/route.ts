import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFilter } from '@/lib/auth-utils';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  Errors,
} from '@/lib/api-utils';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/campaigns/[id]/assign-businesses
 * Assign existing businesses to a campaign
 */
export const POST = createApiHandler(
  async (request: NextRequest, { logger, params }) => {
    const { id: campaignId } = params;

    const body = await parseJsonBody<{
      businessIds: string[];
      assignAll?: boolean;
    }>(request, logger);

    const { businessIds, assignAll } = body;

    // Validate input
    if (!assignAll && (!businessIds || !Array.isArray(businessIds) || businessIds.length === 0)) {
      throw Errors.badRequest('At least one business ID is required, or set assignAll: true');
    }

    // Get user filter (users can only assign their own businesses)
    const userFilter = await getUserFilter();

    // Verify campaign exists and user has access
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        ...userFilter,
      },
    });

    if (!campaign) {
      throw Errors.notFound('Campaign');
    }

    logger.debug('Assigning businesses to campaign', { campaignId, businessIds: businessIds?.length, assignAll });

    let updatedCount = 0;

    if (assignAll) {
      // Assign all user's businesses that are not already in a campaign
      const result = await prisma.business.updateMany({
        where: {
          ...userFilter,
          campaignId: null, // Only assign businesses not in any campaign
        },
        data: {
          campaignId,
        },
      });
      updatedCount = result.count;
    } else {
      // Assign specific businesses
      const result = await prisma.business.updateMany({
        where: {
          id: { in: businessIds },
          ...userFilter, // Only update user's own businesses
        },
        data: {
          campaignId,
        },
      });
      updatedCount = result.count;
    }

    logger.info('Businesses assigned to campaign', { campaignId, updatedCount });

    return jsonResponse({
      message: `Successfully assigned ${updatedCount} company(ies) to campaign`,
      assignedCount: updatedCount,
    });
  },
  { requireAuth: true }
);

/**
 * DELETE /api/campaigns/[id]/assign-businesses
 * Remove businesses from a campaign (set campaignId to null)
 */
export const DELETE = createApiHandler(
  async (request: NextRequest, { logger, params }) => {
    const { id: campaignId } = params;

    const body = await parseJsonBody<{
      businessIds: string[];
      removeAll?: boolean;
    }>(request, logger);

    const { businessIds, removeAll } = body;

    // Validate input
    if (!removeAll && (!businessIds || !Array.isArray(businessIds) || businessIds.length === 0)) {
      throw Errors.badRequest('At least one business ID is required, or set removeAll: true');
    }

    // Get user filter
    const userFilter = await getUserFilter();

    // Verify campaign exists and user has access
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        ...userFilter,
      },
    });

    if (!campaign) {
      throw Errors.notFound('Campaign');
    }

    logger.debug('Removing businesses from campaign', { campaignId, businessIds: businessIds?.length, removeAll });

    let updatedCount = 0;

    if (removeAll) {
      // Remove all businesses from this campaign
      const result = await prisma.business.updateMany({
        where: {
          campaignId,
          ...userFilter,
        },
        data: {
          campaignId: null,
        },
      });
      updatedCount = result.count;
    } else {
      // Remove specific businesses
      const result = await prisma.business.updateMany({
        where: {
          id: { in: businessIds },
          campaignId,
          ...userFilter,
        },
        data: {
          campaignId: null,
        },
      });
      updatedCount = result.count;
    }

    logger.info('Businesses removed from campaign', { campaignId, updatedCount });

    return jsonResponse({
      message: `Successfully removed ${updatedCount} company(ies) from campaign`,
      removedCount: updatedCount,
    });
  },
  { requireAuth: true }
);
