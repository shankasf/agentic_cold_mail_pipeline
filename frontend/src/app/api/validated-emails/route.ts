import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  backfillValidatedEmailBusinesses,
  getValidatedEmailStats,
  recalculateBusinessMetrics,
} from '@/lib/validated-email-tracker';

/**
 * GET /api/validated-emails
 * Get list of validated email businesses with pagination
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const sortBy = searchParams.get('sortBy') || 'validationScore';
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';
    const validatedOnly = searchParams.get('validatedOnly') === 'true';
    const search = searchParams.get('search') || '';

    // Build where clause
    const where: any = {};
    if (validatedOnly) {
      where.isValidated = true;
    }

    // Get total count
    const total = await prisma.validatedEmailBusiness.count({ where });

    // Get paginated results with business info
    const records = await prisma.validatedEmailBusiness.findMany({
      where,
      include: {
        business: {
          select: {
            id: true,
            canonicalName: true,
            website: true,
            industryGuess: true,
            location: true,
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Filter by search if provided (client-side filtering for simplicity)
    const filteredRecords = search
      ? records.filter(r =>
          r.business.canonicalName.toLowerCase().includes(search.toLowerCase()) ||
          (r.lastValidatedEmail?.toLowerCase().includes(search.toLowerCase()))
        )
      : records;

    // Get summary statistics
    const stats = await getValidatedEmailStats();

    return NextResponse.json({
      success: true,
      data: {
        records: filteredRecords,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        stats,
      },
    });
  } catch (error) {
    console.error('Error fetching validated emails:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch validated emails' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/validated-emails
 * Actions: backfill, recalculate
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, businessId } = body;

    switch (action) {
      case 'backfill': {
        // Backfill all businesses from existing email events
        const result = await backfillValidatedEmailBusinesses();
        return NextResponse.json({
          success: true,
          message: `Backfill complete: ${result.processed} processed, ${result.validated} validated, ${result.errors} errors`,
          data: result,
        });
      }

      case 'recalculate': {
        // Recalculate metrics for a specific business
        if (!businessId) {
          return NextResponse.json(
            { success: false, error: 'businessId is required for recalculate action' },
            { status: 400 }
          );
        }

        await recalculateBusinessMetrics(businessId);

        const updated = await prisma.validatedEmailBusiness.findUnique({
          where: { businessId },
          include: {
            business: {
              select: {
                canonicalName: true,
              },
            },
          },
        });

        return NextResponse.json({
          success: true,
          message: `Recalculated metrics for business ${updated?.business?.canonicalName || businessId}`,
          data: updated,
        });
      }

      case 'recalculate-all': {
        // Recalculate all businesses (can be slow)
        const businessIds = await prisma.validatedEmailBusiness.findMany({
          select: { businessId: true },
        });

        let processed = 0;
        let errors = 0;

        for (const { businessId } of businessIds) {
          try {
            await recalculateBusinessMetrics(businessId);
            processed++;
          } catch (e) {
            errors++;
          }
        }

        return NextResponse.json({
          success: true,
          message: `Recalculated ${processed} businesses, ${errors} errors`,
          data: { processed, errors },
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error in validated emails action:', error);
    return NextResponse.json(
      { success: false, error: 'Action failed' },
      { status: 500 }
    );
  }
}
