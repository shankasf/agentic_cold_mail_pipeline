import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import {
  createApiHandler,
  jsonResponse,
  Errors,
} from '@/lib/api-utils';

// GET /api/email-logs/[id] - Get logs for a specific email
export const GET = createApiHandler(
  async (request: NextRequest, { logger, params }) => {
    const { id } = params;

    logger.debug('Fetching email logs', { emailId: id });

    const email = await prisma.emailDraft.findUnique({
      where: { id },
      include: {
        contact: true,
        business: true,
        events: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!email) {
      throw Errors.notFound('Email');
    }

    logger.info('Email logs fetched successfully', { emailId: id });

    return jsonResponse({ email });
  },
  { requireAuth: true }
);
