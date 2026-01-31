import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { extractVariables, DEFAULT_TEMPLATES, TEMPLATE_CATEGORIES } from '@/lib/template-engine';
import { TemplateCategory } from '@prisma/client';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  Errors,
} from '@/lib/api-utils';

// GET /api/templates - List all templates
export const GET = createApiHandler(
  async (request: NextRequest, { logger }) => {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const activeOnly = searchParams.get('active') !== 'false';

    logger.debug('Fetching templates', { category, activeOnly });

    const where: { category?: TemplateCategory; isActive?: boolean } = {};

    if (category && TEMPLATE_CATEGORIES.includes(category as typeof TEMPLATE_CATEGORIES[number])) {
      where.category = category as TemplateCategory;
    }

    if (activeOnly) {
      where.isActive = true;
    }

    const templates = await prisma.emailTemplate.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: { uploads: true },
        },
      },
    });

    logger.info('Templates fetched successfully', { count: templates.length });

    return jsonResponse(templates, {
      cache: 'private, max-age=60, stale-while-revalidate=300',
    });
  },
  { requireAuth: true }
);

// POST /api/templates - Create a new template
export const POST = createApiHandler(
  async (request: NextRequest, { logger }) => {
    const body = await parseJsonBody<{
      category?: string;
      name?: string;
      description?: string;
      subjectTemplate?: string;
      bodyTemplate?: string;
      isActive?: boolean;
    }>(request, logger);

    // Validation
    if (!body.category || !TEMPLATE_CATEGORIES.includes(body.category as typeof TEMPLATE_CATEGORIES[number])) {
      throw Errors.badRequest(
        `Invalid category. Must be one of: ${TEMPLATE_CATEGORIES.join(', ')}`,
        'category'
      );
    }

    if (!body.name || body.name.trim().length === 0) {
      throw Errors.badRequest('Template name is required', 'name');
    }

    if (!body.subjectTemplate || body.subjectTemplate.trim().length === 0) {
      throw Errors.badRequest('Subject template is required', 'subjectTemplate');
    }

    if (!body.bodyTemplate || body.bodyTemplate.trim().length === 0) {
      throw Errors.badRequest('Body template is required', 'bodyTemplate');
    }

    logger.debug('Creating template', { name: body.name, category: body.category });

    // Extract variables from templates
    const subjectVars = extractVariables(body.subjectTemplate);
    const bodyVars = extractVariables(body.bodyTemplate);
    const allVariables = [...new Set([...subjectVars, ...bodyVars])];

    const template = await prisma.emailTemplate.create({
      data: {
        category: body.category as TemplateCategory,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        subjectTemplate: body.subjectTemplate.trim(),
        bodyTemplate: body.bodyTemplate.trim(),
        variables: allVariables,
        isActive: body.isActive !== false,
      },
    });

    logger.info('Template created successfully', { templateId: template.id, name: template.name });

    return jsonResponse(template, { status: 201 });
  },
  { requireAdmin: true }
);

// PUT /api/templates - Seed default templates (admin action)
export const PUT = createApiHandler(
  async (_request, { logger }) => {
    logger.debug('Seeding default templates');

    const created = [];

    for (const category of TEMPLATE_CATEGORIES) {
      const defaultTemplate = DEFAULT_TEMPLATES[category];

      // Check if template for this category already exists
      const existing = await prisma.emailTemplate.findFirst({
        where: { category },
      });

      if (!existing) {
        const template = await prisma.emailTemplate.create({
          data: {
            category,
            name: `Default ${category.charAt(0) + category.slice(1).toLowerCase()} Template`,
            description: `Default template for ${category.toLowerCase()} emails`,
            subjectTemplate: defaultTemplate.subject,
            bodyTemplate: defaultTemplate.body,
            variables: extractVariables(defaultTemplate.subject + defaultTemplate.body),
            isActive: true,
          },
        });
        created.push(template);
      }
    }

    logger.info('Default templates seeded', { createdCount: created.length });

    return jsonResponse({
      message: `Created ${created.length} default templates`,
      templates: created,
    });
  },
  { requireAdmin: true }
);
