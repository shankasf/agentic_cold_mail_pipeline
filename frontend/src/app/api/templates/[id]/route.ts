import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { extractVariables, previewTemplate, TEMPLATE_CATEGORIES } from '@/lib/template-engine';
import { TemplateCategory } from '@prisma/client';

// GET /api/templates/[id] - Get single template with preview
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
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

    return NextResponse.json({
      ...template,
      preview,
    });
  } catch (error) {
    console.error('Error fetching template:', error);
    return NextResponse.json(
      { error: 'Failed to fetch template' },
      { status: 500 }
    );
  }
}

// PATCH /api/templates/[id] - Update template
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.emailTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
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
        return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      }
      updateData.name = body.name.trim();
    }

    if (body.description !== undefined) {
      updateData.description = body.description?.trim() || null;
    }

    if (body.subjectTemplate !== undefined) {
      if (body.subjectTemplate.trim().length === 0) {
        return NextResponse.json({ error: 'Subject template cannot be empty' }, { status: 400 });
      }
      updateData.subjectTemplate = body.subjectTemplate.trim();
    }

    if (body.bodyTemplate !== undefined) {
      if (body.bodyTemplate.trim().length === 0) {
        return NextResponse.json({ error: 'Body template cannot be empty' }, { status: 400 });
      }
      updateData.bodyTemplate = body.bodyTemplate.trim();
    }

    if (body.isActive !== undefined) {
      updateData.isActive = Boolean(body.isActive);
    }

    if (body.category !== undefined) {
      if (!TEMPLATE_CATEGORIES.includes(body.category)) {
        return NextResponse.json(
          { error: `Invalid category. Must be one of: ${TEMPLATE_CATEGORIES.join(', ')}` },
          { status: 400 }
        );
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

    return NextResponse.json(template);
  } catch (error) {
    console.error('Error updating template:', error);
    return NextResponse.json(
      { error: 'Failed to update template' },
      { status: 500 }
    );
  }
}

// DELETE /api/templates/[id] - Delete template
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const template = await prisma.emailTemplate.findUnique({
      where: { id },
      include: {
        _count: { select: { uploads: true } },
      },
    });

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    // Warn if template has uploads
    if (template._count.uploads > 0) {
      return NextResponse.json(
        { error: `Cannot delete template with ${template._count.uploads} uploads. Deactivate it instead.` },
        { status: 400 }
      );
    }

    await prisma.emailTemplate.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Template deleted' });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json(
      { error: 'Failed to delete template' },
      { status: 500 }
    );
  }
}
