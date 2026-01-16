import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/businesses - List businesses
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');
    const industry = searchParams.get('industry');
    const location = searchParams.get('location');
    const minContacts = searchParams.get('minContacts');
    const maxContacts = searchParams.get('maxContacts');
    const minEvidence = searchParams.get('minEvidence');
    const maxEvidence = searchParams.get('maxEvidence');
    const minDrafts = searchParams.get('minDrafts');
    const maxDrafts = searchParams.get('maxDrafts');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const all = searchParams.get('all') === 'true';
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

    if (location) {
      where.location = { contains: location, mode: 'insensitive' };
    }

    // Date range filter
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo + 'T23:59:59.999Z');
    }

    // Count-based filters require filtering after fetching or using raw queries
    // We'll handle these with having clauses via raw query for efficiency
    const hasCountFilters = minContacts || maxContacts || minEvidence || maxEvidence || minDrafts || maxDrafts;

    // If all=true, return all businesses without pagination (for Select All)
    if (all) {
      let businesses = await prisma.business.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          canonicalName: true,
          _count: {
            select: {
              contacts: true,
              evidence: true,
              emailDrafts: true,
            },
          },
        },
      });

      // Apply count filters
      if (hasCountFilters) {
        businesses = businesses.filter((b) => {
          if (minContacts && b._count.contacts < parseInt(minContacts)) return false;
          if (maxContacts && b._count.contacts > parseInt(maxContacts)) return false;
          if (minEvidence && b._count.evidence < parseInt(minEvidence)) return false;
          if (maxEvidence && b._count.evidence > parseInt(maxEvidence)) return false;
          if (minDrafts && b._count.emailDrafts < parseInt(minDrafts)) return false;
          if (maxDrafts && b._count.emailDrafts > parseInt(maxDrafts)) return false;
          return true;
        });
      }

      return NextResponse.json({
        businesses,
        pagination: {
          total: businesses.length,
        },
      });
    }

    // Fetch all matching businesses with counts for filtering
    let allBusinesses = await prisma.business.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            contacts: true,
            evidence: true,
            emailDrafts: true,
          },
        },
      },
    });

    // Apply count filters
    if (hasCountFilters) {
      allBusinesses = allBusinesses.filter((b) => {
        if (minContacts && b._count.contacts < parseInt(minContacts)) return false;
        if (maxContacts && b._count.contacts > parseInt(maxContacts)) return false;
        if (minEvidence && b._count.evidence < parseInt(minEvidence)) return false;
        if (maxEvidence && b._count.evidence > parseInt(maxEvidence)) return false;
        if (minDrafts && b._count.emailDrafts < parseInt(minDrafts)) return false;
        if (maxDrafts && b._count.emailDrafts > parseInt(maxDrafts)) return false;
        return true;
      });
    }

    const total = allBusinesses.length;
    const businesses = allBusinesses.slice((page - 1) * limit, page * limit);

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
