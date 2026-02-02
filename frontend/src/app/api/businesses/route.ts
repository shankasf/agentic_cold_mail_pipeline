import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFilter, getUserIdForCreate } from '@/lib/auth-utils';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  getPaginationParams,
  buildPaginationMeta,
  Errors,
} from '@/lib/api-utils';

// Helper to apply count filters
function applyCountFilters<T extends { _count: { contacts: number; evidence: number; emailDrafts: number } }>(
  businesses: T[],
  filters: {
    minContacts?: number;
    maxContacts?: number;
    minEvidence?: number;
    maxEvidence?: number;
    minDrafts?: number;
    maxDrafts?: number;
  }
): T[] {
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
export const GET = createApiHandler(
  async (request: NextRequest, { logger }) => {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');
    const industry = searchParams.get('industry');
    const location = searchParams.get('location');
    const campaignId = searchParams.get('campaignId');
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
    const filterUserId = searchParams.get('userId'); // Admin can filter by user

    const { page, limit, skip } = getPaginationParams(request);

    // Get user filter
    const userFilter = await getUserFilter(filterUserId);

    logger.debug('Fetching businesses', { search, industry, campaignId, page, limit });

    const where: Record<string, unknown> = {
      ...userFilter, // Apply user filter
    };

    // Campaign filter
    if (campaignId) {
      where.campaignId = campaignId;
    }

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
      where.createdAt = {} as Record<string, Date>;
      if (dateFrom) (where.createdAt as Record<string, Date>).gte = new Date(dateFrom);
      if (dateTo) (where.createdAt as Record<string, Date>).lte = new Date(dateTo + 'T23:59:59.999Z');
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

      logger.info('Businesses fetched (all)', { count: businesses.length });

      return jsonResponse(
        {
          businesses,
          pagination: { total: businesses.length },
        },
        { cache: 'private, max-age=30, stale-while-revalidate=60' }
      );
    }

    // OPTIMIZED: When no count filters, use direct pagination
    if (!hasCountFilters) {
      const [businesses, total] = await Promise.all([
        prisma.business.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
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

      logger.info('Businesses fetched', { count: businesses.length, total });

      return jsonResponse(
        {
          businesses,
          pagination: buildPaginationMeta(total, page, limit),
        },
        { cache: 'private, max-age=30, stale-while-revalidate=60' }
      );
    }

    // When count filters are used, use raw SQL with HAVING for efficient database-level filtering
    const offset = skip;

    // Build dynamic WHERE conditions
    const whereConditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(`(b.canonical_name ILIKE $${paramIndex} OR b.website ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }
    if (industry) {
      whereConditions.push(`b.industry_guess ILIKE $${paramIndex}`);
      params.push(`%${industry}%`);
      paramIndex++;
    }
    if (location) {
      whereConditions.push(`b.location ILIKE $${paramIndex}`);
      params.push(`%${location}%`);
      paramIndex++;
    }
    if (dateFrom) {
      whereConditions.push(`b.created_at >= $${paramIndex}`);
      params.push(new Date(dateFrom));
      paramIndex++;
    }
    if (dateTo) {
      whereConditions.push(`b.created_at <= $${paramIndex}`);
      params.push(new Date(dateTo + 'T23:59:59.999Z'));
      paramIndex++;
    }

    // Build HAVING conditions for count filters
    const havingConditions: string[] = [];
    if (countFilters.minContacts !== undefined) {
      havingConditions.push(`COUNT(DISTINCT c.id) >= $${paramIndex}`);
      params.push(countFilters.minContacts);
      paramIndex++;
    }
    if (countFilters.maxContacts !== undefined) {
      havingConditions.push(`COUNT(DISTINCT c.id) <= $${paramIndex}`);
      params.push(countFilters.maxContacts);
      paramIndex++;
    }
    if (countFilters.minEvidence !== undefined) {
      havingConditions.push(`COUNT(DISTINCT be.id) >= $${paramIndex}`);
      params.push(countFilters.minEvidence);
      paramIndex++;
    }
    if (countFilters.maxEvidence !== undefined) {
      havingConditions.push(`COUNT(DISTINCT be.id) <= $${paramIndex}`);
      params.push(countFilters.maxEvidence);
      paramIndex++;
    }
    if (countFilters.minDrafts !== undefined) {
      havingConditions.push(`COUNT(DISTINCT ed.id) >= $${paramIndex}`);
      params.push(countFilters.minDrafts);
      paramIndex++;
    }
    if (countFilters.maxDrafts !== undefined) {
      havingConditions.push(`COUNT(DISTINCT ed.id) <= $${paramIndex}`);
      params.push(countFilters.maxDrafts);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const havingClause = havingConditions.length > 0 ? `HAVING ${havingConditions.join(' AND ')}` : '';

    // Get total count with filters
    const countQuery = `
      SELECT COUNT(*) as total FROM (
        SELECT b.id
        FROM businesses b
        LEFT JOIN contacts c ON c.business_id = b.id
        LEFT JOIN business_evidence be ON be.business_id = b.id
        LEFT JOIN email_drafts ed ON ed.business_id = b.id
        ${whereClause}
        GROUP BY b.id
        ${havingClause}
      ) filtered
    `;

    // Get paginated results with filters
    const dataQuery = `
      SELECT
        b.id,
        b.canonical_name as "canonicalName",
        b.website,
        b.industry_guess as "industryGuess",
        b.location,
        b.created_at as "createdAt",
        b.updated_at as "updatedAt",
        COUNT(DISTINCT c.id)::int as "contactCount",
        COUNT(DISTINCT be.id)::int as "evidenceCount",
        COUNT(DISTINCT ed.id)::int as "emailDraftCount"
      FROM businesses b
      LEFT JOIN contacts c ON c.business_id = b.id
      LEFT JOIN business_evidence be ON be.business_id = b.id
      LEFT JOIN email_drafts ed ON ed.business_id = b.id
      ${whereClause}
      GROUP BY b.id
      ${havingClause}
      ORDER BY b.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const [countResult, businessesRaw] = await Promise.all([
      prisma.$queryRawUnsafe<[{ total: bigint }]>(countQuery, ...params.slice(0, -2)),
      prisma.$queryRawUnsafe<Array<{
        id: string;
        canonicalName: string;
        website: string | null;
        industryGuess: string | null;
        location: string | null;
        createdAt: Date;
        updatedAt: Date;
        contactCount: number;
        evidenceCount: number;
        emailDraftCount: number;
      }>>(dataQuery, ...params),
    ]);

    const total = Number(countResult[0]?.total || 0);
    const businesses = businessesRaw.map(b => ({
      ...b,
      _count: {
        contacts: b.contactCount,
        evidence: b.evidenceCount,
        emailDrafts: b.emailDraftCount,
      },
    }));

    logger.info('Businesses fetched with count filters', { count: businesses.length, total });

    return jsonResponse(
      {
        businesses,
        pagination: buildPaginationMeta(total, page, limit),
      },
      { cache: 'private, max-age=30, stale-while-revalidate=60' }
    );
  },
  { requireAuth: true }
);

// DELETE /api/businesses - Delete one or multiple businesses
export const DELETE = createApiHandler(
  async (request: NextRequest, { logger }) => {
    const body = await parseJsonBody<{ ids: string[] }>(request, logger);
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw Errors.badRequest('At least one business ID is required');
    }

    const requestedCount = ids.length;
    logger.debug('Deleting businesses', { requestedCount });

    // Get user filter (non-admins can only delete their own)
    const userFilter = await getUserFilter();

    // Use a transaction to handle all deletions properly
    const result = await prisma.$transaction(async (tx) => {
      // First, unlink inbound emails (set businessId to null)
      await tx.inboundEmail.updateMany({
        where: { businessId: { in: ids } },
        data: { businessId: null },
      });

      // Delete businesses (cascades to contacts, evidence, drafts, etc.)
      const deleteResult = await tx.business.deleteMany({
        where: {
          id: { in: ids },
          ...userFilter, // Users can only delete their own businesses
        },
      });

      return deleteResult;
    });

    logger.info('Businesses deleted', { requestedCount, deletedCount: result.count });

    // Build message with info about any skipped records
    let message = `Successfully deleted ${result.count} company(ies)`;
    if (result.count < requestedCount) {
      const skipped = requestedCount - result.count;
      message += ` (${skipped} skipped - may not exist or belong to another user)`;
    }

    return jsonResponse({
      message,
      deletedCount: result.count,
      requestedCount,
    });
  },
  { requireAuth: true }
);

// POST /api/businesses - Create a new business manually
export const POST = createApiHandler(
  async (request: NextRequest, { logger }) => {
    const body = await parseJsonBody<{
      name: string;
      website?: string;
      industry?: string;
      location?: string;
      contacts?: Array<{ email: string; name?: string; role?: string }>;
      campaignId?: string;
    }>(request, logger);

    const { name, website, industry, location, contacts, campaignId } = body;

    if (!name || name.trim().length === 0) {
      throw Errors.badRequest('Company name is required', 'name');
    }

    logger.debug('Creating business', { name: name.trim() });

    // Get current user ID for ownership
    const userId = await getUserIdForCreate();

    // Create the business with user ownership
    const business = await prisma.business.create({
      data: {
        userId, // Set owner
        campaignId: campaignId || null, // Campaign assignment
        canonicalName: name.trim(),
        website: website?.trim() || null,
        industryGuess: industry?.trim() || null,
        location: location?.trim() || null,
      },
    });

    // Create contacts if provided (skip duplicates)
    if (contacts && Array.isArray(contacts) && contacts.length > 0) {
      const validContacts = contacts.filter(
        (c) => c.email && c.email.trim().length > 0
      );

      if (validContacts.length > 0) {
        // Check for existing emails first
        const emailsToCheck = validContacts.map(c => c.email.trim().toLowerCase());
        const existingContacts = await prisma.contact.findMany({
          where: { email: { in: emailsToCheck } },
          select: { email: true },
        });
        const existingEmails = new Set(existingContacts.map(c => c.email));

        // Filter out contacts with existing emails
        const newContacts = validContacts.filter(
          c => !existingEmails.has(c.email.trim().toLowerCase())
        );

        if (newContacts.length > 0) {
          await prisma.contact.createMany({
            data: newContacts.map((c) => ({
              businessId: business.id,
              email: c.email.trim().toLowerCase(),
              name: c.name?.trim() || null,
              role: c.role?.trim() || null,
              sourceConfidence: 100, // Manual entry = high confidence
            })),
            skipDuplicates: true, // Extra safety
          });
        }

        if (existingEmails.size > 0) {
          logger.info('Skipped duplicate contacts', {
            skippedCount: validContacts.length - newContacts.length,
            skippedEmails: Array.from(existingEmails).slice(0, 5),
          });
        }
      }
    }

    // Fetch the created business with counts
    const result = await prisma.business.findUnique({
      where: { id: business.id },
      include: {
        contacts: true,
        _count: {
          select: {
            contacts: true,
            evidence: true,
            emailDrafts: true,
          },
        },
      },
    });

    logger.info('Business created', { businessId: business.id });

    return jsonResponse(result, { status: 201 });
  },
  { requireAuth: true }
);
