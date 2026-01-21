import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Helper to apply count filters
function applyCountFilters(
  businesses: any[],
  filters: {
    minContacts?: number;
    maxContacts?: number;
    minEvidence?: number;
    maxEvidence?: number;
    minDrafts?: number;
    maxDrafts?: number;
  }
) {
  return businesses.filter((b) => {
    if (filters.minContacts !== undefined && b._count.contacts < filters.minContacts) return false;
    if (filters.maxContacts !== undefined && b._count.contacts > filters.maxContacts) return false;
    if (filters.minEvidence !== undefined && b._count.evidence < filters.minEvidence) return false;
    if (filters.maxEvidence !== undefined && b._count.evidence > filters.maxEvidence) return false;
    if (filters.minDrafts !== undefined && b._count.emailDrafts < filters.minDrafts) return false;
    if (filters.maxDrafts !== undefined && b._count.emailDrafts > filters.maxDrafts) return false;
    return true;
  });
}

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
    const includeContacts = searchParams.get('includeContacts') === 'true';
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

    // Parse count filters
    const countFilters = {
      minContacts: minContacts ? parseInt(minContacts) : undefined,
      maxContacts: maxContacts ? parseInt(maxContacts) : undefined,
      minEvidence: minEvidence ? parseInt(minEvidence) : undefined,
      maxEvidence: maxEvidence ? parseInt(maxEvidence) : undefined,
      minDrafts: minDrafts ? parseInt(minDrafts) : undefined,
      maxDrafts: maxDrafts ? parseInt(maxDrafts) : undefined,
    };
    const hasCountFilters = Object.values(countFilters).some((v) => v !== undefined);

    // If all=true, return all businesses without pagination (for Select All)
    if (all) {
      let businesses = await prisma.business.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          canonicalName: true,
          industryGuess: true,
          ...(includeContacts && {
            contacts: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
              take: 3,
            },
          }),
          _count: {
            select: {
              contacts: true,
              evidence: true,
              emailDrafts: true,
            },
          },
        },
      });

      if (hasCountFilters) {
        businesses = applyCountFilters(businesses, countFilters);
      }

      return NextResponse.json({
        businesses,
        pagination: {
          total: businesses.length,
        },
      }, {
        headers: {
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
        },
      });
    }

    // OPTIMIZED: When no count filters, use direct pagination
    if (!hasCountFilters) {
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
      }, {
        headers: {
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
        },
      });
    }

    // When count filters are used, we need to fetch with counts and filter
    // Use select instead of include to reduce payload size
    let allBusinesses = await prisma.business.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        canonicalName: true,
        website: true,
        industryGuess: true,
        location: true,
        createdAt: true,
        updatedAt: true,
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
    allBusinesses = applyCountFilters(allBusinesses, countFilters);

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
    }, {
      headers: {
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
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
