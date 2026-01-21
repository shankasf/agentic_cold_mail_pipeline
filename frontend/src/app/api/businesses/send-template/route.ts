import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { renderTemplate } from '@/lib/template-engine';
import { Prisma } from '@prisma/client';

// POST /api/businesses/send-template - Send template email to selected businesses
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessIds, templateId, customSubject, customBody } = body;

    if (!businessIds || !Array.isArray(businessIds) || businessIds.length === 0) {
      return NextResponse.json(
        { error: 'Business IDs are required' },
        { status: 400 }
      );
    }

    // Either templateId or custom subject/body is required
    const isCustomEmail = customSubject && customBody;

    if (!templateId && !isCustomEmail) {
      return NextResponse.json(
        { error: 'Template ID or custom email content is required' },
        { status: 400 }
      );
    }

    let template: { id: string; name: string; subjectTemplate: string; bodyTemplate: string } | null = null;

    if (templateId) {
      // Get template
      const dbTemplate = await prisma.emailTemplate.findUnique({
        where: { id: templateId },
      });

      if (!dbTemplate) {
        return NextResponse.json(
          { error: 'Template not found' },
          { status: 404 }
        );
      }

      if (!dbTemplate.isActive) {
        return NextResponse.json(
          { error: 'Template is not active' },
          { status: 400 }
        );
      }

      template = {
        id: dbTemplate.id,
        name: dbTemplate.name,
        subjectTemplate: dbTemplate.subjectTemplate,
        bodyTemplate: dbTemplate.bodyTemplate,
      };
    } else {
      // Use custom email content
      template = {
        id: 'custom',
        name: 'Custom Email',
        subjectTemplate: customSubject,
        bodyTemplate: customBody,
      };
    }

    // Get admin settings
    const settings = await prisma.adminSettings.findFirst();
    const calendlyUrl = settings?.calendlyUrl || '';

    // Get businesses with their contacts
    const businesses = await prisma.business.findMany({
      where: {
        id: { in: businessIds },
      },
      include: {
        contacts: true,
      },
    });

    // Get suppression list
    const suppressedEmails = await prisma.suppressionList.findMany({
      select: { email: true },
    });
    const suppressedSet = new Set(suppressedEmails.map(s => s.email.toLowerCase()));

    let queued = 0;
    let skipped = 0;
    const emailDraftsToCreate: Prisma.EmailDraftCreateManyInput[] = [];

    for (const business of businesses) {
      // Skip businesses with no contacts
      if (business.contacts.length === 0) {
        skipped++;
        continue;
      }

      for (const contact of business.contacts) {
        // Skip suppressed emails
        if (suppressedSet.has(contact.email.toLowerCase())) {
          skipped++;
          continue;
        }

        // Prepare variables for template
        // Extract first name from full name
        const fullName = contact.name || '';
        const firstName = fullName.split(' ')[0] || 'there';

        const variables = {
          email: contact.email,
          name: fullName || 'there',
          first_name: firstName,
          company: business.canonicalName,
          role: contact.role || '',
          industry: business.industryGuess || '',
          calendly_url: calendlyUrl,
        };

        // Render template
        const subject = renderTemplate(template.subjectTemplate, variables);
        const bodyText = renderTemplate(template.bodyTemplate, variables);

        emailDraftsToCreate.push({
          businessId: business.id,
          contactId: contact.id,
          subject,
          bodyText,
          footerText: '',
          personalizationTokens: {
            template_id: template.id,
            template_name: template.name,
            variables_used: Object.keys(variables),
            is_custom: isCustomEmail ? true : false,
          },
          confidenceScore: 80,
          deliverabilityScore: 80,
          status: 'APPROVED',
          pipelineType: 'TEMPLATE',
          templateId: templateId || undefined,
        });

        queued++;
      }
    }

    // Batch create email drafts
    if (emailDraftsToCreate.length > 0) {
      await prisma.emailDraft.createMany({
        data: emailDraftsToCreate,
      });
    }

    return NextResponse.json({
      success: true,
      queued,
      skipped,
      message: `Queued ${queued} emails, skipped ${skipped}`,
    });
  } catch (error) {
    console.error('Error sending template emails:', error);
    return NextResponse.json(
      { error: 'Failed to send template emails' },
      { status: 500 }
    );
  }
}
