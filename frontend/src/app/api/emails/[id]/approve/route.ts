import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import {
  createApiHandler,
  jsonResponse,
  Errors,
} from '@/lib/api-utils';

// POST /api/emails/[id]/approve - Approve an email for sending
export const POST = createApiHandler(
  async (request: NextRequest, { logger, params }) => {
    const { id } = params;

    logger.debug('Approving email', { emailId: id });

    const email = await prisma.emailDraft.findUnique({
      where: { id },
    });

    if (!email) {
      throw Errors.notFound('Email');
    }

    // Get admin settings for thresholds
    const settings = await prisma.adminSettings.findFirst();
    const deliverabilityThreshold = settings?.deliverabilityThreshold ?? 70;

    // Check if email meets deliverability threshold
    if (email.deliverabilityScore < deliverabilityThreshold) {
      throw Errors.badRequest(
        `Deliverability score (${email.deliverabilityScore}) is below threshold (${deliverabilityThreshold})`
      );
    }

    // Check if email is in a state that can be approved
    if (!['DRAFT', 'NEEDS_REVIEW'].includes(email.status)) {
      throw Errors.badRequest(`Cannot approve email with status: ${email.status}`);
    }

    // Update to approved
    const updated = await prisma.emailDraft.update({
      where: { id },
      data: { status: 'APPROVED' },
    });

    logger.info('Email approved', { emailId: id });

    return jsonResponse(updated);
  },
  { requireAuth: true }
);
