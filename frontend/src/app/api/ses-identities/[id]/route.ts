import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { getIdentityVerificationStatus, getWarmupLimit } from '@/lib/ses';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  Errors,
} from '@/lib/api-utils';

// GET /api/ses-identities/[id] - Get a specific SES identity with verification status
export const GET = createApiHandler(
  async (request: NextRequest, { logger, user, params }) => {
    const { id } = params;

    logger.debug('Fetching SES identity', { identityId: id });

    const identity = await prisma.sESIdentity.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            emailDrafts: true,
            sequences: true,
          },
        },
      },
    });

    if (!identity) {
      throw Errors.notFound('Identity');
    }

    // Check permission
    if (user.role !== 'ADMIN' && identity.userId !== user.id) {
      throw Errors.forbidden('You do not have permission to view this identity');
    }

    // Check verification status from SES if still pending
    let sesStatus = null;
    if (identity.status === 'PENDING') {
      const statusResult = await getIdentityVerificationStatus(identity.emailAddress);
      sesStatus = statusResult;

      // Update status if verified
      if (statusResult.verified && identity.status === 'PENDING') {
        await prisma.sESIdentity.update({
          where: { id: identity.id },
          data: {
            status: 'VERIFIED',
            verifiedAt: new Date(),
          },
        });
        identity.status = 'VERIFIED';
      }
    }

    logger.debug('SES identity fetched', { identityId: id });

    return jsonResponse({
      identity,
      sesStatus,
    });
  },
  { requireAuth: true }
);

// PATCH /api/ses-identities/[id] - Update an SES identity
export const PATCH = createApiHandler(
  async (request: NextRequest, { logger, user, params }) => {
    const { id } = params;

    logger.debug('Updating SES identity', { identityId: id });

    const identity = await prisma.sESIdentity.findUnique({
      where: { id },
    });

    if (!identity) {
      throw Errors.notFound('Identity');
    }

    // Check permission
    if (user.role !== 'ADMIN' && identity.userId !== user.id) {
      throw Errors.forbidden('You do not have permission to update this identity');
    }

    const body = await parseJsonBody<{
      displayName?: string;
      warmupEnabled?: boolean;
      status?: string;
      dailyLimit?: number;
    }>(request, logger);

    const updates: Record<string, unknown> = {};

    // Allowed updates
    if (typeof body.displayName === 'string') {
      updates.displayName = body.displayName || null;
    }

    if (typeof body.warmupEnabled === 'boolean') {
      updates.warmupEnabled = body.warmupEnabled;

      // If enabling warmup, set initial warmup day if not set
      if (body.warmupEnabled && identity.warmupDay === 0) {
        updates.warmupDay = 1;
        updates.dailyLimit = getWarmupLimit(1);
        updates.status = 'WARMING';
      }

      // If disabling warmup, keep current limit but change status
      if (!body.warmupEnabled && identity.status === 'WARMING') {
        updates.status = 'ACTIVE';
      }
    }

    if (typeof body.status === 'string') {
      // Only admins can manually change status
      if (user.role !== 'ADMIN') {
        throw Errors.forbidden('Only admins can change identity status');
      }
      updates.status = body.status;
    }

    if (typeof body.dailyLimit === 'number') {
      // Only admins can manually set daily limit
      if (user.role !== 'ADMIN') {
        throw Errors.forbidden('Only admins can change daily limit');
      }
      updates.dailyLimit = body.dailyLimit;
    }

    const updated = await prisma.sESIdentity.update({
      where: { id },
      data: updates,
    });

    logger.info('SES identity updated', { identityId: id });

    return jsonResponse({ identity: updated });
  },
  { requireAuth: true }
);

// POST /api/ses-identities/[id] - Actions (verify, pause, resume)
export const POST = createApiHandler(
  async (request: NextRequest, { logger, user, params }) => {
    const { id } = params;

    logger.debug('Performing action on SES identity', { identityId: id });

    const identity = await prisma.sESIdentity.findUnique({
      where: { id },
    });

    if (!identity) {
      throw Errors.notFound('Identity');
    }

    // Check permission
    if (user.role !== 'ADMIN' && identity.userId !== user.id) {
      throw Errors.forbidden('You do not have permission to perform this action');
    }

    const body = await parseJsonBody<{ action: string }>(request, logger);
    const { action } = body;

    switch (action) {
      case 'check-verification': {
        const statusResult = await getIdentityVerificationStatus(identity.emailAddress);

        if (statusResult.verified && identity.status === 'PENDING') {
          await prisma.sESIdentity.update({
            where: { id: identity.id },
            data: {
              status: 'VERIFIED',
              verifiedAt: new Date(),
            },
          });
          logger.info('SES identity verified', { identityId: id });
          return jsonResponse({
            verified: true,
            message: 'Email verified successfully!',
          });
        }

        return jsonResponse({
          verified: statusResult.verified,
          status: statusResult.status,
          message: statusResult.verified
            ? 'Email is verified'
            : 'Email is not yet verified. Please check your inbox.',
        });
      }

      case 'pause': {
        if (identity.status === 'PAUSED') {
          return jsonResponse({
            message: 'Identity is already paused',
          });
        }

        await prisma.sESIdentity.update({
          where: { id: identity.id },
          data: { status: 'PAUSED' },
        });

        logger.info('SES identity paused', { identityId: id });

        return jsonResponse({
          success: true,
          message: 'Identity paused',
        });
      }

      case 'resume': {
        if (identity.status !== 'PAUSED') {
          throw Errors.badRequest('Identity is not paused');
        }

        const newStatus = identity.warmupEnabled ? 'WARMING' : 'ACTIVE';
        await prisma.sESIdentity.update({
          where: { id: identity.id },
          data: { status: newStatus },
        });

        logger.info('SES identity resumed', { identityId: id, newStatus });

        return jsonResponse({
          success: true,
          message: `Identity resumed with status: ${newStatus}`,
        });
      }

      case 'reset-daily-count': {
        // Admin only
        if (user.role !== 'ADMIN') {
          throw Errors.forbidden('Only admins can reset daily count');
        }

        await prisma.sESIdentity.update({
          where: { id: identity.id },
          data: { sentToday: 0 },
        });

        logger.info('SES identity daily count reset', { identityId: id });

        return jsonResponse({
          success: true,
          message: 'Daily count reset',
        });
      }

      default:
        throw Errors.badRequest(`Unknown action: ${action}`, 'action');
    }
  },
  { requireAuth: true }
);
