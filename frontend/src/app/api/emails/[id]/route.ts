import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import aiClient from '@/lib/ai-client';
import { EmailStatus } from '@prisma/client';
import { createApiHandler, jsonResponse, parseJsonBody, Errors } from '@/lib/api-utils';

// GET /api/emails/[id] - Get email draft details
export const GET = createApiHandler(
  async (request: NextRequest, { logger, params }) => {
    const { id } = params;

    logger.debug('Fetching email', { emailId: id });

    const email = await prisma.emailDraft.findUnique({
      where: { id },
      include: {
        business: {
          include: {
            evidence: {
              include: {
                chunk: true,
              },
            },
          },
        },
        contact: true,
        events: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!email) {
      throw Errors.notFound('Email');
    }

    logger.info('Email fetched', { emailId: id });

    return jsonResponse(email);
  },
  { requireAuth: true }
);

// PATCH /api/emails/[id] - Update email draft
export const PATCH = createApiHandler(
  async (request: NextRequest, { logger, params }) => {
    const { id } = params;
    const body = await parseJsonBody<{
      subject?: string;
      bodyText?: string;
      status?: string;
    }>(request, logger);

    logger.debug('Updating email', { emailId: id });

    // Input validation
    if (body.subject !== undefined) {
      if (typeof body.subject !== 'string') {
        throw Errors.validation('Subject must be a string', 'subject');
      }
      if (body.subject.length === 0) {
        throw Errors.validation('Subject cannot be empty', 'subject');
      }
      if (body.subject.length > 200) {
        throw Errors.validation('Subject must be 200 characters or less', 'subject');
      }
    }

    if (body.bodyText !== undefined) {
      if (typeof body.bodyText !== 'string') {
        throw Errors.validation('Body text must be a string', 'bodyText');
      }
      if (body.bodyText.length === 0) {
        throw Errors.validation('Body text cannot be empty', 'bodyText');
      }
      if (body.bodyText.length > 10000) {
        throw Errors.validation('Body text must be 10000 characters or less', 'bodyText');
      }
    }

    const validStatuses = ['DRAFT', 'NEEDS_REVIEW', 'APPROVED', 'EXPORTED', 'SENT', 'REPLIED', 'BOUNCED', 'COMPLAINT'];
    if (body.status !== undefined) {
      const normalizedStatus = String(body.status).toUpperCase();
      if (!validStatuses.includes(normalizedStatus)) {
        throw Errors.validation(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 'status');
      }
    }

    const email = await prisma.emailDraft.findUnique({
      where: { id },
    });

    if (!email) {
      throw Errors.notFound('Email');
    }

    // Build update data object
    const updateData: {
      subject?: string;
      bodyText?: string;
      deliverabilityScore?: number;
      spamFlags?: string[];
      footerText?: string;
      status?: EmailStatus;
    } = {};

    if (body.subject !== undefined || body.bodyText !== undefined) {
      const subject = body.subject ?? email.subject;
      const bodyText = body.bodyText ?? email.bodyText;

      // Recheck compliance
      const compliance = await aiClient.recheckCompliance(subject, bodyText);

      updateData.subject = subject;
      updateData.bodyText = bodyText;
      updateData.deliverabilityScore = compliance.deliverabilityScore;
      updateData.spamFlags = compliance.spamFlags;
      updateData.footerText = compliance.footerText;
    }

    if (body.status !== undefined) {
      updateData.status = String(body.status).toUpperCase() as EmailStatus;
    }

    const updated = await prisma.emailDraft.update({
      where: { id },
      data: updateData,
      include: {
        business: true,
        contact: true,
      },
    });

    logger.info('Email updated', { emailId: id });

    return jsonResponse(updated);
  },
  { requireAuth: true }
);

// DELETE /api/emails/[id] - Delete email draft
export const DELETE = createApiHandler(
  async (request: NextRequest, { logger, params }) => {
    const { id } = params;

    logger.debug('Deleting email', { emailId: id });

    // Check if email exists
    const email = await prisma.emailDraft.findUnique({
      where: { id },
    });

    if (!email) {
      throw Errors.notFound('Email');
    }

    // Use a transaction to handle all related records
    await prisma.$transaction(async (tx) => {
      // Clear originalEmailId references in InboundEmail records
      await tx.inboundEmail.updateMany({
        where: { originalEmailId: id },
        data: { originalEmailId: null },
      });

      // Clear parentEmailId references in child EmailDrafts (thread replies)
      await tx.emailDraft.updateMany({
        where: { parentEmailId: id },
        data: { parentEmailId: null },
      });

      // Delete the email (EmailEvent cascade delete will handle events)
      await tx.emailDraft.delete({
        where: { id },
      });
    });

    logger.info('Email deleted', { emailId: id });

    return jsonResponse({ message: 'Email deleted' });
  },
  { requireAuth: true }
);
