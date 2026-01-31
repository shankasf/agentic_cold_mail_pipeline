import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { extractVariables, previewTemplate, TEMPLATE_CATEGORIES } from '@/lib/template-engine';
import { TemplateCategory } from '@prisma/client';
import { createApiHandler, jsonResponse, parseJsonBody, Errors } from '@/lib/api-utils';

// GET /api/templates/[id] - Get single template with preview
export const GET = createApiHandler(
  async (request: NextRequest, { logger, params }) => {
    const { id } = params;

    logger.debug('Fetching template', { templateId: id });

    const template = await prisma.emailTemplate.findUnique({
      where: { id },
      include: {
        uploads: {
          orderBy: { uploadedAt: 'desc' },
          take: 5,
        },
        _count: {
          select: { uploads: true },
        },
      },
    });

    if (!template) {
      throw Errors.notFound('Template');
    }

    // Generate preview
    const preview = previewTemplate({
      id: template.id,
      category: template.category,
      name: template.name,
      subjectTemplate: template.subjectTemplate,
      bodyTemplate: template.bodyTemplate,
      variables: (template.variables as string[] | null) || [],
    });

    logger.info('Template fetched', { templateId: id });

    return jsonResponse({
      ...template,
      preview,
    });
  },
  { requireAuth: true }
);

// PATCH /api/templates/[id] - Update template
export const PATCH = createApiHandler(
  async (request: NextRequest, { logger, params }) => {
    const { id } = params;
    const body = await parseJsonBody<{
      name?: string;
      description?: string | null;
      subjectTemplate?: string;
      bodyTemplate?: string;
      isActive?: boolean;
      category?: string;
    }>(request, logger);

    logger.debug('Updating template', { templateId: id });

    const existing = await prisma.emailTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      throw Errors.notFound('Template');
    }

    // Build update data
    const updateData: {
      name?: string;
      description?: string | null;
      subjectTemplate?: string;
      bodyTemplate?: string;
      variables?: string[];
      isActive?: boolean;
      category?: TemplateCategory;
    } = {};

    if (body.name !== undefined) {
      if (body.name.trim().length === 0) {
        throw Errors.validation('Name cannot be empty', 'name');
      }
      updateData.name = body.name.trim();
    }

    if (body.description !== undefined) {
      updateData.description = body.description?.trim() || null;
    }

    if (body.subjectTemplate !== undefined) {
      if (body.subjectTemplate.trim().length === 0) {
        throw Errors.validation('Subject template cannot be empty', 'subjectTemplate');
      }
      updateData.subjectTemplate = body.subjectTemplate.trim();
    }

    if (body.bodyTemplate !== undefined) {
      if (body.bodyTemplate.trim().length === 0) {
        throw Errors.validation('Body template cannot be empty', 'bodyTemplate');
      }
      updateData.bodyTemplate = body.bodyTemplate.trim();
    }

    if (body.isActive !== undefined) {
      updateData.isActive = Boolean(body.isActive);
    }

    if (body.category !== undefined) {
      if (!TEMPLATE_CATEGORIES.includes(body.category as typeof TEMPLATE_CATEGORIES[number])) {
        throw Errors.validation(`Invalid category. Must be one of: ${TEMPLATE_CATEGORIES.join(', ')}`, 'category');
      }
      updateData.category = body.category as TemplateCategory;
    }

    // Re-extract variables if templates changed
    if (updateData.subjectTemplate || updateData.bodyTemplate) {
      const subject = updateData.subjectTemplate || existing.subjectTemplate;
      const bodyTpl = updateData.bodyTemplate || existing.bodyTemplate;
      updateData.variables = [
        ...new Set([...extractVariables(subject), ...extractVariables(bodyTpl)]),
      ];
    }

    const template = await prisma.emailTemplate.update({
      where: { id },
      data: updateData,
    });

    logger.info('Template updated', { templateId: id });

    return jsonResponse(template);
  },
  { requireAuth: true }
);

// DELETE /api/templates/[id] - Delete template
export const DELETE = createApiHandler(
  async (request: NextRequest, { logger, params }) => {
    const { id } = params;

    logger.debug('Deleting template', { templateId: id });

    const template = await prisma.emailTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      throw Errors.notFound('Template');
    }

    // Use transaction to handle all related records
    await prisma.$transaction(async (tx) => {
      // Clear createdTemplateId references in TemplateFileUpload
      await tx.templateFileUpload.updateMany({
        where: { createdTemplateId: id },
        data: { createdTemplateId: null },
      });

      // Delete the template (TemplateUpload cascade delete will handle uploads)
      await tx.emailTemplate.delete({
        where: { id },
      });
    });

    logger.info('Template deleted', { templateId: id });

    return jsonResponse({ message: 'Template deleted' });
  },
  { requireAuth: true }
);
