import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/emails/threads - Get email threads grouped by business
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const businessId = searchParams.get('businessId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    if (businessId) {
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

      return NextResponse.json({ emails });
    }

    // Get all businesses with their email counts and latest email
    const businesses = await prisma.business.findMany({
      where: {
        emailDrafts: { some: {} },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
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

    return NextResponse.json({
      threads,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching email threads:', error);
    return NextResponse.json(
      { error: 'Failed to fetch email threads' },
      { status: 500 }
    );
  }
}
