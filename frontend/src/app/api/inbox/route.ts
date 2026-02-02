import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { createApiHandler, jsonResponse, parseJsonBody, Errors } from '@/lib/api-utils';

// GET /api/inbox - List inbound emails (replies)
export const GET = createApiHandler(
  async (request: NextRequest, { logger, user }) => {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const isRead = searchParams.get('isRead');
    const isArchived = searchParams.get('isArchived');
    const isStarred = searchParams.get('isStarred');
    const search = searchParams.get('search');
    const threadId = searchParams.get('threadId');
    const identityId = searchParams.get('identityId');
    const campaignId = searchParams.get('campaignId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const sortBy = searchParams.get('sortBy') || 'receivedAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    logger.debug('Fetching inbox emails', { page, limit, isRead, isArchived, identityId, campaignId });

    const where: any = {};

    // Filter by read status
    if (isRead === 'true') {
      where.isRead = true;
    } else if (isRead === 'false') {
      where.isRead = false;
    }

    // Filter by archived status (default: not archived)
    if (isArchived === 'true') {
      where.isArchived = true;
    } else if (isArchived !== 'all') {
      where.isArchived = false;
    }

    // Filter by starred
    if (isStarred === 'true') {
      where.isStarred = true;
    }

    // Filter by thread
    if (threadId) {
      where.threadId = threadId;
    }

    // Filter by campaign (via business)
    if (campaignId && campaignId !== 'all') {
      where.business = {
        campaignId: campaignId,
      };
    }

    // Date range filter
    if (dateFrom || dateTo) {
      where.receivedAt = {};
      if (dateFrom) {
        where.receivedAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        where.receivedAt.lte = endDate;
      }
    }

    // Search in subject and from email
    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { fromEmail: { contains: search, mode: 'insensitive' } },
        { fromName: { contains: search, mode: 'insensitive' } },
        { bodyText: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get user's SES identities to filter relevant emails
    const userIdentities = await prisma.sESIdentity.findMany({
      where: user.role === 'ADMIN' ? {} : { userId: user.id },
      select: { id: true, emailAddress: true, displayName: true },
    });
    const userIdentityIds = userIdentities.map((i) => i.id);

    // Filter by specific identity or all user's identities
    if (identityId && identityId !== 'all') {
      if (userIdentityIds.includes(identityId)) {
        where.sesIdentityId = identityId;
      } else {
        throw Errors.notFound('Identity');
      }
    } else if (user.role !== 'ADMIN') {
      where.sesIdentityId = { in: userIdentityIds };
    }

    // Get campaigns for filter dropdown
    const campaigns = await prisma.campaign.findMany({
      where: user.role === 'ADMIN' ? {} : { userId: user.id },
      select: { id: true, name: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Build orderBy
    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    const [emails, total, unreadCount] = await Promise.all([
      prisma.inboundEmail.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          originalEmail: {
            select: {
              id: true,
              subject: true,
              status: true,
              businessId: true,
            },
          },
          contact: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          business: {
            select: {
              id: true,
              canonicalName: true,
              industryGuess: true,
              campaignId: true,
              campaign: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          sesIdentity: {
            select: {
              id: true,
              emailAddress: true,
              displayName: true,
            },
          },
          attachments: {
            select: {
              id: true,
              filename: true,
              contentType: true,
              sizeBytes: true,
              isInline: true,
            },
          },
        },
      }),
      prisma.inboundEmail.count({ where }),
      prisma.inboundEmail.count({
        where: {
          ...where,
          isRead: false,
        },
      }),
    ]);

    logger.info('Inbox emails fetched', { count: emails.length, total, unreadCount });
    return jsonResponse({
      emails,
      unreadCount,
      identities: userIdentities,
      campaigns,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  },
  { requireAuth: true }
);

// PATCH /api/inbox - Bulk update emails
export const PATCH = createApiHandler(
  async (request: NextRequest, { logger, user }) => {
    const body = await parseJsonBody<{ ids: string[]; updates: { isRead?: boolean; isArchived?: boolean; isStarred?: boolean } }>(request, logger);
    const { ids, updates } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      throw Errors.badRequest('Email IDs are required');
    }

    logger.debug('Bulk updating inbox emails', { count: ids.length, updates });

    const allowedUpdates: any = {};

    if (typeof updates.isRead === 'boolean') {
      allowedUpdates.isRead = updates.isRead;
    }

    if (typeof updates.isArchived === 'boolean') {
      allowedUpdates.isArchived = updates.isArchived;
    }

    if (typeof updates.isStarred === 'boolean') {
      allowedUpdates.isStarred = updates.isStarred;
    }

    if (Object.keys(allowedUpdates).length === 0) {
      throw Errors.badRequest('No valid updates provided');
    }

    // Check permissions for non-admins
    if (user.role !== 'ADMIN') {
      const userIdentities = await prisma.sESIdentity.findMany({
        where: { userId: user.id },
        select: { id: true },
      });
      const identityIds = userIdentities.map((i) => i.id);

      const emailCount = await prisma.inboundEmail.count({
        where: {
          id: { in: ids },
          sesIdentityId: { in: identityIds },
        },
      });

      if (emailCount !== ids.length) {
        throw Errors.forbidden('You do not have permission to update some of these emails');
      }
    }

    const result = await prisma.inboundEmail.updateMany({
      where: { id: { in: ids } },
      data: allowedUpdates,
    });

    logger.info('Inbox emails updated', { updated: result.count });
    return jsonResponse({
      success: true,
      updated: result.count,
    });
  },
  { requireAuth: true }
);

// DELETE /api/inbox - Delete emails permanently
export const DELETE = createApiHandler(
  async (request: NextRequest, { logger, user }) => {
    const body = await parseJsonBody<{ ids: string[] }>(request, logger);
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      throw Errors.badRequest('Email IDs are required');
    }

    logger.debug('Deleting inbox emails', { count: ids.length });

    // Check permissions for non-admins
    if (user.role !== 'ADMIN') {
      const userIdentities = await prisma.sESIdentity.findMany({
        where: { userId: user.id },
        select: { id: true },
      });
      const identityIds = userIdentities.map((i) => i.id);

      const emailCount = await prisma.inboundEmail.count({
        where: {
          id: { in: ids },
          sesIdentityId: { in: identityIds },
        },
      });

      if (emailCount !== ids.length) {
        throw Errors.forbidden('You do not have permission to delete some of these emails');
      }
    }

    const result = await prisma.inboundEmail.deleteMany({
      where: { id: { in: ids } },
    });

    logger.info('Inbox emails deleted', { deleted: result.count });
    return jsonResponse({
      success: true,
      deleted: result.count,
    });
  },
  { requireAuth: true }
);
