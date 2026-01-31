import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { createApiHandler, jsonResponse, parseJsonBody, Errors } from '@/lib/api-utils';

// POST /api/emails/delete - Delete emails by IDs
export const POST = createApiHandler(
  async (request: NextRequest, { logger }) => {
    const body = await parseJsonBody<{ emailIds: string[] }>(request, logger);
    const { emailIds } = body;

    if (!emailIds || !Array.isArray(emailIds) || emailIds.length === 0) {
      throw Errors.badRequest('Email IDs are required');
    }

    logger.debug('Deleting emails', { count: emailIds.length });

    // Use a transaction to handle all related records
    const result = await prisma.$transaction(async (tx) => {
      // Clear originalEmailId references in InboundEmail records
      await tx.inboundEmail.updateMany({
        where: { originalEmailId: { in: emailIds } },
        data: { originalEmailId: null },
      });

      // Clear parentEmailId references in child EmailDrafts (thread replies)
      await tx.emailDraft.updateMany({
        where: { parentEmailId: { in: emailIds } },
        data: { parentEmailId: null },
      });

      // Delete the emails (EmailEvent cascade delete will handle events)
      return tx.emailDraft.deleteMany({
        where: { id: { in: emailIds } },
      });
    });

    logger.info('Emails deleted', { deletedCount: result.count });

    return jsonResponse({
      success: true,
      deleted: result.count,
      message: `Deleted ${result.count} email(s)`,
    });
  },
  { requireAuth: true }
);
