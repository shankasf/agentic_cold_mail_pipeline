import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFilter } from '@/lib/auth-utils';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  Errors,
} from '@/lib/api-utils';

interface BulkApproveRequest {
  emailIds?: string[];
  campaignId?: string;
  force?: boolean; // Bypass deliverability threshold
}

interface BulkApproveResponse {
  success: boolean;
  approvedCount: number;
  message: string;
}

// Default deliverability threshold (can be overridden with force=true)
const DEFAULT_DELIVERABILITY_THRESHOLD = 70;

// POST /api/emails/bulk-approve - Instantly approve multiple emails with single DB call
export const POST = createApiHandler<BulkApproveResponse>(
  async (request: NextRequest, { logger, user }) => {
    const body = await parseJsonBody<BulkApproveRequest>(request, logger);
    const { emailIds, campaignId, force = false } = body;

    // Must provide either emailIds or campaignId
    if ((!emailIds || emailIds.length === 0) && !campaignId) {
      throw Errors.badRequest('Either emailIds or campaignId is required');
    }

    // Get admin settings for threshold
    const settings = await prisma.adminSettings.findFirst();
    const threshold = settings?.deliverabilityThreshold ?? DEFAULT_DELIVERABILITY_THRESHOLD;

    // Get user filter for ownership check
    const userFilter = await getUserFilter();

    logger.debug('Bulk approve request', {
      emailIdCount: emailIds?.length,
      campaignId,
      force,
      threshold,
    });

    // Build the where clause
    const whereClause: Record<string, unknown> = {
      ...userFilter, // Apply user ownership filter
      status: { in: ['DRAFT', 'NEEDS_REVIEW'] },
    };

    // If specific email IDs provided
    if (emailIds && emailIds.length > 0) {
      whereClause.id = { in: emailIds };
    }

    // If campaign filter provided, filter through business relationship
    if (campaignId) {
      whereClause.business = {
        campaignId,
      };
    }

    // Apply deliverability threshold unless force=true
    if (!force) {
      whereClause.deliverabilityScore = { gte: threshold };
    }

    // Single atomic database call to approve all matching emails
    const result = await prisma.emailDraft.updateMany({
      where: whereClause,
      data: {
        status: 'APPROVED',
        updatedAt: new Date(),
      },
    });

    logger.info('Bulk approve completed', {
      approvedCount: result.count,
      force,
      campaignId,
      emailIdCount: emailIds?.length,
    });

    return jsonResponse({
      success: true,
      approvedCount: result.count,
      message: `Successfully approved ${result.count} email(s)${force ? ' (forced)' : ''}`,
    });
  },
  { requireAuth: true }
);
