import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/emails - List email drafts with filters
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const industry = searchParams.get('industry');
    const minConfidence = searchParams.get('minConfidence');
    const maxConfidence = searchParams.get('maxConfidence');
    const minDeliverability = searchParams.get('minDeliverability');
    const maxDeliverability = searchParams.get('maxDeliverability');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    // Build where clause
    const where: any = {};

    if (status) {
      where.status = status.toUpperCase();
    }

    if (minConfidence || maxConfidence) {
      where.confidenceScore = {};
      if (minConfidence) where.confidenceScore.gte = parseInt(minConfidence);
      if (maxConfidence) where.confidenceScore.lte = parseInt(maxConfidence);
    }

    if (minDeliverability || maxDeliverability) {
      where.deliverabilityScore = {};
      if (minDeliverability) where.deliverabilityScore.gte = parseInt(minDeliverability);
      if (maxDeliverability) where.deliverabilityScore.lte = parseInt(maxDeliverability);
    }

    if (industry) {
      where.business = {
        industryGuess: {
          contains: industry,
          mode: 'insensitive',
        },
      };
    }

    const [emails, total] = await Promise.all([
      prisma.emailDraft.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
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
        },
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
    console.error('Error fetching emails:', error);
    return NextResponse.json(
      { error: 'Failed to fetch emails' },
      { status: 500 }
    );
  }
}
