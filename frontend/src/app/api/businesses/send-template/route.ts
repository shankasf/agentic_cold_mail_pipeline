import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { renderTemplate } from '@/lib/template-engine';
import { Prisma } from '@prisma/client';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  Errors,
} from '@/lib/api-utils';

interface SendTemplateRequest {
  businessIds: string[];
  templateId?: string;
  customSubject?: string;
  customBody?: string;
}

// POST /api/businesses/send-template - Send template email to selected businesses
export const POST = createApiHandler(
  async (request: NextRequest, { logger }) => {
    const body = await parseJsonBody<SendTemplateRequest>(request, logger);
    const { businessIds, templateId, customSubject, customBody } = body;

    if (!businessIds || !Array.isArray(businessIds) || businessIds.length === 0) {
      throw Errors.badRequest('Business IDs are required', 'businessIds');
    }

    // Either templateId or custom subject/body is required
    const isCustomEmail = customSubject && customBody;

    if (!templateId && !isCustomEmail) {
      throw Errors.badRequest('Template ID or custom email content is required');
    }

    logger.debug('Processing send template request', {
      businessCount: businessIds.length,
      templateId,
      isCustomEmail,
    });

    let template: { id: string; name: string; subjectTemplate: string; bodyTemplate: string };

    if (templateId) {
      // Get template
      const dbTemplate = await prisma.emailTemplate.findUnique({
        where: { id: templateId },
      });

      if (!dbTemplate) {
        throw Errors.notFound('Template');
      }

      if (!dbTemplate.isActive) {
        throw Errors.badRequest('Template is not active');
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
        subjectTemplate: customSubject!,
        bodyTemplate: customBody!,
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

    logger.info('Template emails queued', {
      queued,
      skipped,
      templateId: template.id,
      templateName: template.name,
    });

    return jsonResponse({
      success: true,
      queued,
      skipped,
      message: `Queued ${queued} emails, skipped ${skipped}`,
    });
  },
  { requireAuth: true }
);
