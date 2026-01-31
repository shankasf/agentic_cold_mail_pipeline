import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import {
  createApiHandler,
  jsonResponse,
  getPaginationParams,
  buildPaginationMeta,
} from '@/lib/api-utils';

// GET /api/emails/threads - Get email threads grouped by business
export const GET = createApiHandler(
  async (request: NextRequest, { logger }) => {
    const searchParams = request.nextUrl.searchParams;
    const businessId = searchParams.get('businessId');
    const { page, limit, skip } = getPaginationParams(request);

    if (businessId) {
      logger.debug('Fetching emails for business', { businessId });

      // Get all emails for a specific business, ordered by date
      const emails = await prisma.emailDraft.findMany({
        where: { businessId },
        orderBy: { createdAt: 'asc' },
        include: {
          business: {
            select: {
              id: true,
              canonicalName: true,
              industryGuess: true,
              website: true,
            },
          },
          contact: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
            },
          },
          events: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      });

      logger.info('Emails fetched for business', { businessId, count: emails.length });

      return jsonResponse({ emails });
    }

    logger.debug('Fetching email threads', { page, limit });

    // Get all businesses with their email counts and latest email
    const businesses = await prisma.business.findMany({
      where: {
        emailDrafts: { some: {} },
      },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
      include: {
        _count: {
          select: { emailDrafts: true },
        },
        emailDrafts: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            subject: true,
            status: true,
            createdAt: true,
            sentAt: true,
          },
        },
        contacts: {
          take: 1,
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    const total = await prisma.business.count({
      where: { emailDrafts: { some: {} } },
    });

    const threads = businesses.map((b) => ({
      businessId: b.id,
      businessName: b.canonicalName,
      industry: b.industryGuess,
      emailCount: b._count.emailDrafts,
      latestEmail: b.emailDrafts[0] || null,
      primaryContact: b.contacts[0] || null,
    }));

    logger.info('Email threads fetched', { count: threads.length, total });

    return jsonResponse({
      threads,
      pagination: buildPaginationMeta(total, page, limit),
    });
  },
  { requireAuth: true }
);
