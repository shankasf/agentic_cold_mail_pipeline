import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma, EmailStatus } from '@prisma/client';
import { getCurrentUser } from '@/lib/auth';

// GET /api/email-logs - Get all emails with their events/logs
export async function GET(request: NextRequest) {
  try {
    // Get current user for role-based filtering
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const sender = searchParams.get('sender');

    const skip = (page - 1) * limit;

    const where: Prisma.EmailDraftWhereInput = {};

    // Role-based access: SALES_REP can only see their own emails
    if (currentUser.role === 'SALES_REP') {
      where.fromEmail = currentUser.email;
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
          contact: true,
          business: true,
          events: {
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.emailDraft.count({ where }),
      // Get unique senders (only for admins)
      currentUser.role === 'ADMIN'
        ? prisma.emailDraft.findMany({
            where: { status: { in: validStatuses } },
            select: { fromEmail: true, fromName: true },
            distinct: ['fromEmail'],
          })
        : Promise.resolve([]),
    ]);

    const senders = sendersList.map(s => ({ email: s.fromEmail, name: s.fromName }));

    return NextResponse.json({
      emails,
      senders,
      isAdmin: currentUser.role === 'ADMIN',
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }, {
      headers: {
        'Cache-Control': 'private, max-age=15, stale-while-revalidate=30',
      },
    });
  } catch (error) {
    console.error('Error fetching email logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch email logs' },
      { status: 500 }
    );
  }
}
