import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  Errors,
} from '@/lib/api-utils';

// POST /api/emails/follow-up - Create follow-up emails for selected emails
export const POST = createApiHandler(
  async (request: NextRequest, { logger }) => {
    const body = await parseJsonBody<{
      emailIds: string[];
      subject: string;
      bodyText: string;
    }>(request, logger);

    const { emailIds, subject, bodyText } = body;

    if (!emailIds || !Array.isArray(emailIds) || emailIds.length === 0) {
      throw Errors.badRequest('Email IDs are required');
    }

    if (!subject || !bodyText) {
      throw Errors.badRequest('Subject and body are required');
    }

    logger.debug('Creating follow-up emails', { emailCount: emailIds.length });

    // Get the original emails
    const originalEmails = await prisma.emailDraft.findMany({
      where: { id: { in: emailIds } },
      include: {
        contact: true,
        business: true,
      },
    });

    if (originalEmails.length === 0) {
      throw Errors.notFound('Emails');
    }

    // Create follow-up emails
    const followUpEmails = await Promise.all(
      originalEmails.map(async (email) => {
        // Determine thread ID - use existing or create new from original email
        const threadId = email.threadId || email.id;

        return prisma.emailDraft.create({
          data: {
            businessId: email.businessId,
            contactId: email.contactId,
            fromName: email.fromName,
            fromEmail: email.fromEmail,
            subject: subject.includes('Re:') ? subject : `Re: ${email.subject}`,
            bodyText,
            footerText: email.footerText,
            personalizationTokens: {
              follow_up: true,
              original_email_id: email.id,
            },
            confidenceScore: 80,
            deliverabilityScore: 80,
            status: 'APPROVED', // Auto-approve follow-ups
            pipelineType: 'TEMPLATE',
            parentEmailId: email.id,
            threadId,
          },
        });
      })
    );

    // Update original emails with thread ID if not set
    await Promise.all(
      originalEmails
        .filter((email) => !email.threadId)
        .map((email) =>
          prisma.emailDraft.update({
            where: { id: email.id },
            data: { threadId: email.id },
          })
        )
    );

    logger.info('Follow-up emails created', { created: followUpEmails.length });

    return jsonResponse({
      success: true,
      created: followUpEmails.length,
      message: `Created ${followUpEmails.length} follow-up email(s)`,
      emails: followUpEmails.map((e) => e.id),
    });
  },
  { requireAuth: true }
);
