import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserIdForCreate } from '@/lib/auth-utils';
import * as XLSX from 'xlsx';
import type { Prisma } from '@prisma/client';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  Errors,
  HandlerContext,
} from '@/lib/api-utils';

// GET /api/campaigns/[id]/leads - List leads with filtering, pagination, search
export const GET = createApiHandler(
  async (request: NextRequest, { logger, user, params }: HandlerContext) => {
    const campaignId = params.id;
    const searchParams = request.nextUrl.searchParams;

    logger.debug('Fetching leads for campaign', { campaignId });

    // Verify campaign access
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        ...(user.role !== 'ADMIN' ? { userId: user.id } : {}),
      },
    });

    if (!campaign) {
      throw Errors.notFound('Campaign');
    }

    // Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = (page - 1) * limit;

    // Filtering
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const tags = searchParams.get('tags')?.split(',').filter(Boolean) || [];

    // Build where clause
    const where: Record<string, unknown> = {
      campaignId,
    };

    // Non-admin users can only see their own leads
    if (user.role !== 'ADMIN') {
      where.userId = user.id;
    }

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (tags.length > 0) {
      where.tags = { hasEvery: tags };
    }

    // Fetch leads and count
    const [leads, total, columns, statusCounts] = await Promise.all([
      prisma.lead.findMany({
        where: where as Prisma.LeadWhereInput,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.lead.count({ where: where as Prisma.LeadWhereInput }),
      prisma.leadColumn.findMany({
        where: { campaignId },
        orderBy: { orderIndex: 'asc' },
      }),
      prisma.lead.groupBy({
        by: ['status'],
        where: { campaignId } as Prisma.LeadWhereInput,
        _count: { status: true },
      }),
    ]);

    // Format status counts
    const statusBreakdown: Record<string, number> = {};
    statusCounts.forEach((sc) => {
      statusBreakdown[sc.status] = sc._count.status;
    });

    logger.debug('Leads fetched successfully', { total, page, limit });

    return jsonResponse({
      leads,
      columns,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        total,
        statusBreakdown,
      },
    });
  },
  { requireAuth: true }
);

// POST /api/campaigns/[id]/leads - Create lead(s) or import from file
export const POST = createApiHandler<unknown>(
  async (request: NextRequest, { logger, user, params }: HandlerContext) => {
    const userId = await getUserIdForCreate();
    if (!userId) {
      throw Errors.unauthorized();
    }

    const campaignId = params.id;

    logger.debug('Creating lead(s) for campaign', { campaignId });

    // Verify campaign access
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        ...(user.role !== 'ADMIN' ? { userId: user.id } : {}),
      },
    });

    if (!campaign) {
      throw Errors.notFound('Campaign');
    }

    const contentType = request.headers.get('content-type') || '';

    // Handle file upload (import)
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File;

      if (!file) {
        throw Errors.badRequest('No file provided');
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const filename = file.name.toLowerCase();

      let data: Record<string, unknown>[] = [];

      // Parse file based on type
      if (filename.endsWith('.csv') || filename.endsWith('.tsv') || filename.endsWith('.txt')) {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
      } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
      } else if (filename.endsWith('.json')) {
        const text = buffer.toString('utf-8');
        const parsed = JSON.parse(text);
        data = Array.isArray(parsed) ? parsed : [parsed];
      } else {
        throw Errors.badRequest('Unsupported file type');
      }

      if (data.length === 0) {
        throw Errors.badRequest('No data found in file');
      }

      // Get existing columns for this campaign
      const existingColumns = await prisma.leadColumn.findMany({
        where: { campaignId },
      });
      const existingColumnKeys = new Set(existingColumns.map((c) => c.key));

      // Map columns from file
      const columnMapping = mapColumns(Object.keys(data[0] as object));
      const newColumns: { name: string; key: string; type: string }[] = [];

      // Identify new custom columns
      for (const col of Object.keys(data[0] as object)) {
        const mapped = columnMapping[col];
        if (!mapped && !existingColumnKeys.has(toKey(col))) {
          newColumns.push({
            name: col,
            key: toKey(col),
            type: 'text',
          });
        }
      }

      // Create new columns
      if (newColumns.length > 0) {
        const maxOrder = existingColumns.length > 0
          ? Math.max(...existingColumns.map((c) => c.orderIndex))
          : 0;

        await prisma.leadColumn.createMany({
          data: newColumns.map((col, idx) => ({
            campaignId,
            name: col.name,
            key: col.key,
            type: col.type,
            orderIndex: maxOrder + idx + 1,
          })),
        });
      }

      // Process leads
      let created = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const row of data) {
        try {
          const leadData = mapRowToLead(row as Record<string, unknown>, columnMapping);

          if (!leadData.email) {
            skipped++;
            continue;
          }

          // Check for duplicate
          const existing = await prisma.lead.findUnique({
            where: {
              campaignId_email: {
                campaignId,
                email: leadData.email,
              },
            },
          });

          if (existing) {
            skipped++;
            continue;
          }

          // Detect email provider
          const provider = detectEmailProvider(leadData.email);

          await prisma.lead.create({
            data: {
              campaignId,
              userId,
              email: leadData.email,
              firstName: leadData.firstName || null,
              lastName: leadData.lastName || null,
              company: leadData.company || null,
              title: leadData.title || null,
              phone: leadData.phone || null,
              linkedinUrl: leadData.linkedinUrl || null,
              website: leadData.website || null,
              location: leadData.location || null,
              industry: leadData.industry || null,
              emailProvider: provider,
              customColumns: (leadData.customColumns || {}) as Prisma.InputJsonValue,
              source: 'import',
              sourceFile: file.name,
            },
          });

          created++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          errors.push(msg);
          skipped++;
        }
      }

      logger.info('File import completed', { created, skipped, total: data.length });

      return jsonResponse({
        success: true,
        created,
        skipped,
        total: data.length,
        errors: errors.slice(0, 10),
      });
    }

    // Handle single lead creation (JSON)
    const body = await parseJsonBody<{
      email?: string;
      firstName?: string;
      lastName?: string;
      company?: string;
      title?: string;
      phone?: string;
      linkedinUrl?: string;
      website?: string;
      location?: string;
      industry?: string;
      customColumns?: Record<string, unknown>;
      tags?: string[];
    }>(request, logger);

    if (!body.email) {
      throw Errors.badRequest('Email is required', 'email');
    }

    // Check for duplicate
    const existing = await prisma.lead.findUnique({
      where: {
        campaignId_email: {
          campaignId,
          email: body.email,
        },
      },
    });

    if (existing) {
      throw Errors.conflict('Lead with this email already exists', 'email');
    }

    const provider = detectEmailProvider(body.email);

    const lead = await prisma.lead.create({
      data: {
        campaignId,
        userId,
        email: body.email,
        firstName: body.firstName || null,
        lastName: body.lastName || null,
        company: body.company || null,
        title: body.title || null,
        phone: body.phone || null,
        linkedinUrl: body.linkedinUrl || null,
        website: body.website || null,
        location: body.location || null,
        industry: body.industry || null,
        emailProvider: provider,
        customColumns: (body.customColumns || {}) as Prisma.InputJsonValue,
        tags: body.tags || [],
        source: 'manual',
      },
    });

    logger.info('Lead created', { leadId: lead.id, campaignId });

    return jsonResponse(lead, { status: 201 });
  },
  { requireAuth: true }
);

// PATCH /api/campaigns/[id]/leads - Bulk update leads
export const PATCH = createApiHandler(
  async (request: NextRequest, { logger, user, params }: HandlerContext) => {
    const campaignId = params.id;
    const body = await parseJsonBody<{
      leadIds: string[];
      updates: Record<string, unknown>;
    }>(request, logger);

    const { leadIds, updates } = body;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      throw Errors.badRequest('leadIds array is required', 'leadIds');
    }

    logger.debug('Bulk updating leads', { campaignId, leadCount: leadIds.length });

    // Verify campaign access
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        ...(user.role !== 'ADMIN' ? { userId: user.id } : {}),
      },
    });

    if (!campaign) {
      throw Errors.notFound('Campaign');
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    const allowedFields = ['status', 'tags', 'firstName', 'lastName', 'company', 'title', 'phone', 'linkedinUrl', 'website', 'location', 'industry'];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    }

    // Build where clause for user access
    const whereBase: Record<string, unknown> = {
      id: { in: leadIds },
      campaignId,
    };

    if (user.role !== 'ADMIN') {
      whereBase.userId = user.id;
    }

    // Handle custom columns update
    if (updates.customColumns) {
      // For custom columns, we need to merge with existing
      const leads = await prisma.lead.findMany({
        where: whereBase as Prisma.LeadWhereInput,
        select: { id: true, customColumns: true },
      });

      for (const lead of leads) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            ...updateData,
            customColumns: {
              ...(lead.customColumns as object || {}),
              ...(updates.customColumns as object),
            },
          },
        });
      }

      logger.info('Leads updated with custom columns', { updated: leads.length });

      return jsonResponse({ updated: leads.length });
    }

    // Bulk update
    const result = await prisma.lead.updateMany({
      where: whereBase as Prisma.LeadWhereInput,
      data: updateData,
    });

    logger.info('Leads bulk updated', { updated: result.count });

    return jsonResponse({ updated: result.count });
  },
  { requireAuth: true }
);

// DELETE /api/campaigns/[id]/leads - Delete leads
export const DELETE = createApiHandler(
  async (request: NextRequest, { logger, user, params }: HandlerContext) => {
    const campaignId = params.id;
    const body = await parseJsonBody<{ leadIds: string[] }>(request, logger);
    const { leadIds } = body;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      throw Errors.badRequest('leadIds array is required', 'leadIds');
    }

    logger.debug('Deleting leads', { campaignId, leadCount: leadIds.length });

    // Verify campaign access
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        ...(user.role !== 'ADMIN' ? { userId: user.id } : {}),
      },
    });

    if (!campaign) {
      throw Errors.notFound('Campaign');
    }

    const whereBase: Record<string, unknown> = {
      id: { in: leadIds },
      campaignId,
    };

    if (user.role !== 'ADMIN') {
      whereBase.userId = user.id;
    }

    const result = await prisma.lead.deleteMany({
      where: whereBase as Prisma.LeadWhereInput,
    });

    logger.info('Leads deleted', { deleted: result.count });

    return jsonResponse({ deleted: result.count });
  },
  { requireAuth: true }
);

// Helper functions
function mapColumns(columns: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const mappings: Record<string, string[]> = {
    email: ['email', 'e-mail', 'email address', 'emailaddress', 'mail'],
    firstName: ['first name', 'firstname', 'first', 'given name', 'givenname', 'fname'],
    lastName: ['last name', 'lastname', 'last', 'surname', 'family name', 'familyname', 'lname'],
    company: ['company', 'company name', 'companyname', 'organization', 'organisation', 'org', 'business'],
    title: ['title', 'job title', 'jobtitle', 'position', 'role', 'job'],
    phone: ['phone', 'phone number', 'phonenumber', 'telephone', 'tel', 'mobile', 'cell'],
    linkedinUrl: ['linkedin', 'linkedin url', 'linkedinurl', 'linkedin profile', 'li url'],
    website: ['website', 'url', 'web', 'site', 'homepage', 'company website'],
    location: ['location', 'city', 'address', 'region', 'country', 'state'],
    industry: ['industry', 'sector', 'vertical', 'field'],
  };

  for (const col of columns) {
    const lowerCol = col.toLowerCase().trim();
    for (const [field, aliases] of Object.entries(mappings)) {
      if (aliases.includes(lowerCol)) {
        mapping[col] = field;
        break;
      }
    }
  }

  return mapping;
}

function toKey(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function mapRowToLead(
  row: Record<string, unknown>,
  columnMapping: Record<string, string>
): {
  email?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  phone?: string;
  linkedinUrl?: string;
  website?: string;
  location?: string;
  industry?: string;
  customColumns: Record<string, unknown>;
} {
  const lead: Record<string, unknown> = {};
  const customColumns: Record<string, unknown> = {};

  for (const [col, value] of Object.entries(row)) {
    const mapped = columnMapping[col];
    if (mapped) {
      lead[mapped] = String(value || '').trim();
    } else {
      customColumns[toKey(col)] = value;
    }
  }

  return {
    email: lead.email as string | undefined,
    firstName: lead.firstName as string | undefined,
    lastName: lead.lastName as string | undefined,
    company: lead.company as string | undefined,
    title: lead.title as string | undefined,
    phone: lead.phone as string | undefined,
    linkedinUrl: lead.linkedinUrl as string | undefined,
    website: lead.website as string | undefined,
    location: lead.location as string | undefined,
    industry: lead.industry as string | undefined,
    customColumns,
  };
}

function detectEmailProvider(email: string): string {
  const domain = email.split('@')[1]?.toLowerCase() || '';

  const providers: Record<string, string[]> = {
    Google: ['gmail.com', 'googlemail.com'],
    Microsoft: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'microsoft.com'],
    Yahoo: ['yahoo.com', 'ymail.com'],
    Apple: ['icloud.com', 'me.com', 'mac.com'],
    ProtonMail: ['protonmail.com', 'proton.me', 'pm.me'],
  };

  for (const [provider, domains] of Object.entries(providers)) {
    if (domains.includes(domain)) {
      return provider;
    }
  }

  // Check for Google Workspace / Microsoft 365 common patterns
  if (domain.includes('google') || domain.endsWith('.goog')) {
    return 'Google';
  }

  return 'Other';
}
