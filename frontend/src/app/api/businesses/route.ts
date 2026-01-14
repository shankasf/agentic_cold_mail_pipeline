import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/businesses - List businesses
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');
    const industry = searchParams.get('industry');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const where: any = {};

    if (search) {
      where.OR = [
        { canonicalName: { contains: search, mode: 'insensitive' } },
        { website: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (industry) {
      where.industryGuess = { contains: industry, mode: 'insensitive' };
    }

    const [businesses, total] = await Promise.all([
      prisma.business.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: {
            select: {
              contacts: true,
              evidence: true,
              emailDrafts: true,
            },
          },
        },
      }),
      prisma.business.count({ where }),
    ]);

    return NextResponse.json({
      businesses,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching businesses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch businesses' },
      { status: 500 }
    );
  }
}
