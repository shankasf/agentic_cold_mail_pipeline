import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/email-logs - Get all emails with their events/logs
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status'); // Optional filter

    const skip = (page - 1) * limit;

    const where: any = {};

    // Only show emails that have been sent or attempted
    if (status) {
      where.status = status;
    } else {
      where.status = { in: ['SENT', 'BOUNCED', 'COMPLAINT'] };
    }

    const [emails, total] = await Promise.all([
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
    ]);

    return NextResponse.json({
      emails,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
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
