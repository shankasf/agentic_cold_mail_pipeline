import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma, EmailStatus } from '@prisma/client';
import {
  createApiHandler,
  jsonResponse,
  getPaginationParams,
  buildPaginationMeta,
} from '@/lib/api-utils';

// GET /api/email-logs - Get all emails with their events/logs
export const GET = createApiHandler(
  async (request: NextRequest, { logger, user }) => {
    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const sender = searchParams.get('sender');

    const { page, limit, skip } = getPaginationParams(request);

    logger.debug('Fetching email logs', { status, search, page, limit });

    const where: Prisma.EmailDraftWhereInput = {};

    // Role-based access: SALES_REP can only see their own emails
    if (user.role === 'SALES_REP') {
      where.fromEmail = user.email;
    }

    // Status filter
    const validStatuses: EmailStatus[] = ['SENT', 'BOUNCED', 'COMPLAINT'];
    if (status && status !== 'ALL' && validStatuses.includes(status as EmailStatus)) {
      where.status = status as EmailStatus;
    } else {
      where.status = { in: validStatuses };
    }

    // Search filter (email address or subject)
    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { contact: { email: { contains: search, mode: 'insensitive' } } },
        { contact: { name: { contains: search, mode: 'insensitive' } } },
        { business: { canonicalName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // Date range filter
    if (dateFrom || dateTo) {
      where.updatedAt = {};
      if (dateFrom) {
        where.updatedAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        // Add one day to include the entire end date
        const endDate = new Date(dateTo);
        endDate.setDate(endDate.getDate() + 1);
        where.updatedAt.lte = endDate;
      }
    }

    // Sender filter
    if (sender) {
      where.fromEmail = sender;
    }

    const [emails, total, sendersList] = await Promise.all([
      prisma.emailDraft.findMany({
        where,
        include: {
          contact: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          business: {
            select: {
              id: true,
              canonicalName: true,
            },
          },
          events: {
            take: 10,
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.emailDraft.count({ where }),
      // Get unique senders (only for admins)
      user.role === 'ADMIN'
        ? prisma.emailDraft.findMany({
            where: { status: { in: validStatuses } },
            select: { fromEmail: true, fromName: true },
            distinct: ['fromEmail'],
          })
        : Promise.resolve([]),
    ]);

    const senders = sendersList.map(s => ({ email: s.fromEmail, name: s.fromName }));

    logger.info('Email logs fetched', { count: emails.length, total });

    return jsonResponse(
      {
        emails,
        senders,
        isAdmin: user.role === 'ADMIN',
        pagination: buildPaginationMeta(total, page, limit),
      },
      { cache: 'private, max-age=15, stale-while-revalidate=30' }
    );
  },
  { requireAuth: true }
);
