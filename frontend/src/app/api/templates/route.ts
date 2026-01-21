import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { extractVariables, DEFAULT_TEMPLATES, TEMPLATE_CATEGORIES } from '@/lib/template-engine';
import { TemplateCategory } from '@prisma/client';

// GET /api/templates - List all templates
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const activeOnly = searchParams.get('active') !== 'false';

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

    return NextResponse.json(templates, {
      headers: {
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}

// POST /api/templates - Create a new template
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validation
    if (!body.category || !TEMPLATE_CATEGORIES.includes(body.category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${TEMPLATE_CATEGORIES.join(', ')}` },
        { status: 400 }
      );
    }

    if (!body.name || body.name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Template name is required' },
        { status: 400 }
      );
    }

    if (!body.subjectTemplate || body.subjectTemplate.trim().length === 0) {
      return NextResponse.json(
        { error: 'Subject template is required' },
        { status: 400 }
      );
    }

    if (!body.bodyTemplate || body.bodyTemplate.trim().length === 0) {
      return NextResponse.json(
        { error: 'Body template is required' },
        { status: 400 }
      );
    }

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

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error('Error creating template:', error);
    return NextResponse.json(
      { error: 'Failed to create template' },
      { status: 500 }
    );
  }
}

// PUT /api/templates - Seed default templates (admin action)
export async function PUT() {
  try {
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

    return NextResponse.json({
      message: `Created ${created.length} default templates`,
      templates: created,
    });
  } catch (error) {
    console.error('Error seeding templates:', error);
    return NextResponse.json(
      { error: 'Failed to seed templates' },
      { status: 500 }
    );
  }
}
