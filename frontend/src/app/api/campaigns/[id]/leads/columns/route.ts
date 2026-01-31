import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  Errors,
  HandlerContext,
} from '@/lib/api-utils';

// GET /api/campaigns/[id]/leads/columns - Get all columns for campaign
export const GET = createApiHandler(
  async (request: NextRequest, { logger, user, params }: HandlerContext) => {
    const campaignId = params.id;

    logger.debug('Fetching columns for campaign', { campaignId });

    // Verify campaign access
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        ...(user.role !== 'ADMIN' ? { userId: user.id } : {}),
      },
    });

    if (!campaign) {
      throw Errors.notFound('Campaign');
    }

    const columns = await prisma.leadColumn.findMany({
      where: { campaignId },
      orderBy: { orderIndex: 'asc' },
    });

    logger.debug('Columns fetched', { count: columns.length });

    return jsonResponse({ columns });
  },
  { requireAuth: true }
);

// POST /api/campaigns/[id]/leads/columns - Create a new column
export const POST = createApiHandler(
  async (request: NextRequest, { logger, user, params }: HandlerContext) => {
    const campaignId = params.id;
    const body = await parseJsonBody<{
      name?: string;
      type?: string;
      options?: string[];
      isRequired?: boolean;
    }>(request, logger);

    const { name, type = 'text', options = [], isRequired = false } = body;

    if (!name) {
      throw Errors.badRequest('Column name is required', 'name');
    }

    logger.debug('Creating column', { campaignId, name, type });

    // Verify campaign access
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        ...(user.role !== 'ADMIN' ? { userId: user.id } : {}),
      },
    });

    if (!campaign) {
      throw Errors.notFound('Campaign');
    }

    // Generate key from name
    const key = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

    // Check if column already exists
    const existing = await prisma.leadColumn.findUnique({
      where: {
        campaignId_key: {
          campaignId,
          key,
        },
      },
    });

    if (existing) {
      throw Errors.conflict('Column with this name already exists', 'name');
    }

    // Get max order index
    const maxOrder = await prisma.leadColumn.aggregate({
      where: { campaignId },
      _max: { orderIndex: true },
    });

    const column = await prisma.leadColumn.create({
      data: {
        campaignId,
        name,
        key,
        type,
        options,
        isRequired,
        orderIndex: (maxOrder._max.orderIndex || 0) + 1,
      },
    });

    logger.info('Column created', { columnId: column.id, key });

    return jsonResponse(column, { status: 201 });
  },
  { requireAuth: true }
);

// PATCH /api/campaigns/[id]/leads/columns - Update column order
export const PATCH = createApiHandler(
  async (request: NextRequest, { logger, user, params }: HandlerContext) => {
    const campaignId = params.id;
    const body = await parseJsonBody<{
      columnId?: string;
      name?: string;
      type?: string;
      options?: string[];
      isRequired?: boolean;
      orderIndex?: number;
    }>(request, logger);

    const { columnId, name, type, options, isRequired, orderIndex } = body;

    if (!columnId) {
      throw Errors.badRequest('columnId is required', 'columnId');
    }

    logger.debug('Updating column', { campaignId, columnId });

    // Verify campaign access
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        ...(user.role !== 'ADMIN' ? { userId: user.id } : {}),
      },
    });

    if (!campaign) {
      throw Errors.notFound('Campaign');
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (options !== undefined) updateData.options = options;
    if (isRequired !== undefined) updateData.isRequired = isRequired;
    if (orderIndex !== undefined) updateData.orderIndex = orderIndex;

    const column = await prisma.leadColumn.update({
      where: {
        id: columnId,
        campaignId,
      },
      data: updateData,
    });

    logger.info('Column updated', { columnId });

    return jsonResponse(column);
  },
  { requireAuth: true }
);

// DELETE /api/campaigns/[id]/leads/columns - Delete a column
export const DELETE = createApiHandler(
  async (request: NextRequest, { logger, user, params }: HandlerContext) => {
    const campaignId = params.id;
    const body = await parseJsonBody<{ columnId?: string }>(request, logger);
    const { columnId } = body;

    if (!columnId) {
      throw Errors.badRequest('columnId is required', 'columnId');
    }

    logger.debug('Deleting column', { campaignId, columnId });

    // Verify campaign access
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        ...(user.role !== 'ADMIN' ? { userId: user.id } : {}),
      },
    });

    if (!campaign) {
      throw Errors.notFound('Campaign');
    }

    // Get column to find its key
    const column = await prisma.leadColumn.findFirst({
      where: {
        id: columnId,
        campaignId,
      },
    });

    if (!column) {
      throw Errors.notFound('Column');
    }

    // Delete the column
    await prisma.leadColumn.delete({
      where: { id: columnId },
    });

    logger.info('Column deleted', { columnId, key: column.key });

    return jsonResponse({ success: true, deletedKey: column.key });
  },
  { requireAuth: true }
);
