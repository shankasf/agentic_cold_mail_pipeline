import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  Errors,
} from '@/lib/api-utils';

// POST /api/emails/reply - Create and optionally send a reply to an email thread
export const POST = createApiHandler(
  async (request: NextRequest, { logger }) => {
    const body = await parseJsonBody<{
      businessId: string;
      contactId: string;
      subject: string;
      bodyText: string;
      sendImmediately?: boolean;
    }>(request, logger);

    const { businessId, contactId, subject, bodyText, sendImmediately = false } = body;

    if (!businessId || !contactId) {
      throw Errors.badRequest('Business ID and Contact ID are required');
    }

    if (!subject || !bodyText) {
      throw Errors.badRequest('Subject and body are required');
    }

    logger.debug('Creating reply email', { businessId, contactId, sendImmediately });

    // Get business and contact
    const [business, contact] = await Promise.all([
      prisma.business.findUnique({ where: { id: businessId } }),
      prisma.contact.findUnique({ where: { id: contactId } }),
    ]);

    if (!business) {
      throw Errors.notFound('Business');
    }

    if (!contact) {
      throw Errors.notFound('Contact');
    }

    // Find existing thread for this business/contact combo
    const existingThread = await prisma.emailDraft.findFirst({
      where: {
        businessId,
        contactId,
        threadId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });

    const threadId = existingThread?.threadId || undefined;
    const parentEmailId = existingThread?.id || undefined;

    // Get admin settings for sender info
    const settings = await prisma.adminSettings.findFirst();

    // Create the reply email
    const email = await prisma.emailDraft.create({
      data: {
        businessId,
        contactId,
        fromName: settings?.businessAddress ? 'CallSphere' : 'CallSphere',
        fromEmail: 'sagar@callsphere.tech',
        subject,
        bodyText,
        footerText: '',
        personalizationTokens: {
          manual_reply: true,
        },
        confidenceScore: 100, // Manual replies are confident
        deliverabilityScore: 100,
        status: sendImmediately ? 'APPROVED' : 'DRAFT',
        pipelineType: 'TEMPLATE',
        parentEmailId,
        threadId,
      },
      include: {
        business: true,
        contact: true,
      },
    });

    logger.info('Reply email created', { emailId: email.id, sendImmediately });

    // If sending immediately, send the email
    if (sendImmediately) {
      const { sendEmail } = await import('@/lib/email-sender');

      const result = await sendEmail(email.id);

      if (result.success) {
        // Update sentAt timestamp
        await prisma.emailDraft.update({
          where: { id: email.id },
          data: { sentAt: new Date() },
        });

        logger.info('Reply sent successfully', { emailId: email.id });

        return jsonResponse({
          success: true,
          sent: true,
          email: { ...email, status: 'SENT' },
          message: 'Reply sent successfully',
        });
      } else {
        logger.error('Failed to send reply', { emailId: email.id, error: result.error });

        return jsonResponse({
          success: true,
          sent: false,
          email,
          message: result.error || 'Reply created but failed to send. It has been saved as a draft.',
        });
      }
    }

    return jsonResponse({
      success: true,
      sent: false,
      email,
      message: 'Reply created as draft',
    });
  },
  { requireAuth: true }
);
