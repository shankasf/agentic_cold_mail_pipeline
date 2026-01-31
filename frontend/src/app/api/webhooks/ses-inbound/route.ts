import { NextRequest } from 'next/server';
import { createApiHandler, jsonResponse } from '@/lib/api-utils';
import prisma from '@/lib/prisma';

// SNS message types
interface SNSMessage {
  Type: string;
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  SubscribeURL?: string;
  UnsubscribeURL?: string;
}

// SES inbound email notification structure
interface SESInboundNotification {
  notificationType: string;
  mail: {
    timestamp: string;
    source: string;
    messageId: string;
    destination: string[];
    headersTruncated: boolean;
    headers: Array<{
      name: string;
      value: string;
    }>;
    commonHeaders: {
      returnPath: string;
      from: string[];
      to: string[];
      subject: string;
      messageId: string;
    };
  };
  receipt: {
    timestamp: string;
    processingTimeMillis: number;
    recipients: string[];
    spamVerdict: { status: string };
    virusVerdict: { status: string };
    spfVerdict: { status: string };
    dkimVerdict: { status: string };
    dmarcVerdict: { status: string };
    action: {
      type: string;
      topicArn?: string;
      bucketName?: string;
      objectKey?: string;
    };
  };
  content?: string; // Raw email content (if action includes content)
}

// Parse email address "Name <email@example.com>" -> { name, email }
function parseEmailAddress(address: string): { name: string | null; email: string } {
  const match = address.match(/^(?:"?([^"]*)"?\s)?<?([^>]+@[^>]+)>?$/);
  if (match) {
    return {
      name: match[1]?.trim() || null,
      email: match[2].toLowerCase(),
    };
  }
  return { name: null, email: address.toLowerCase() };
}

// Extract header value by name
function getHeader(headers: Array<{ name: string; value: string }>, name: string): string | null {
  const header = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return header?.value || null;
}

// POST /api/webhooks/ses-inbound - Handle inbound email notifications from SNS
export const POST = createApiHandler<unknown>(
  async (request: NextRequest, { logger, requestId }) => {
    const body = await request.text();
    let snsMessage: SNSMessage;

    try {
      snsMessage = JSON.parse(body);
    } catch {
      logger.error('Failed to parse SNS message', null, {
        bodyPreview: body.substring(0, 200),
      });
      return jsonResponse({ error: 'Invalid JSON' }, { status: 400, requestId });
    }

    // Handle SNS subscription confirmation
    if (snsMessage.Type === 'SubscriptionConfirmation') {
      logger.info('SNS subscription confirmation received', {
        topicArn: snsMessage.TopicArn,
        subscribeURL: snsMessage.SubscribeURL,
      });

      // Auto-confirm by visiting the URL
      if (snsMessage.SubscribeURL) {
        try {
          await fetch(snsMessage.SubscribeURL);
          logger.info('SNS subscription confirmed');
        } catch (error) {
          logger.error('Failed to confirm SNS subscription', error);
        }
      }

      return jsonResponse({ message: 'Subscription confirmation processed' }, { requestId });
    }

    // Handle notification
    if (snsMessage.Type === 'Notification') {
      let notification: SESInboundNotification;

      try {
        notification = JSON.parse(snsMessage.Message);
      } catch {
        logger.error('Failed to parse SES notification', null, {
          messagePreview: snsMessage.Message.substring(0, 200),
        });
        return jsonResponse({ error: 'Invalid notification' }, { status: 400, requestId });
      }

      // Process the inbound email
      const { mail, receipt, content } = notification;

      logger.debug('Processing inbound email', {
        sesMessageId: mail.messageId,
        from: mail.source,
        subject: mail.commonHeaders.subject,
      });

      // Extract headers
      const inReplyTo = getHeader(mail.headers, 'In-Reply-To');
      const references = getHeader(mail.headers, 'References');

      // Parse from address
      const fromParsed = parseEmailAddress(mail.commonHeaders.from[0] || mail.source);

      // Get the recipient (our SES identity)
      const toEmail = mail.destination[0]?.toLowerCase();

      // Find the SES identity this email was sent to
      const sesIdentity = toEmail
        ? await prisma.sESIdentity.findUnique({
            where: { emailAddress: toEmail },
          })
        : null;

      // Find the original email if this is a reply
      let originalEmail = null;
      let threadId = null;

      if (inReplyTo) {
        // Try to find by SES message ID (format: <message-id>)
        const cleanMessageId = inReplyTo.replace(/[<>]/g, '');
        originalEmail = await prisma.emailDraft.findFirst({
          where: { sesMessageId: cleanMessageId },
        });

        if (originalEmail) {
          threadId = originalEmail.threadId || originalEmail.id;

          // Update original email status to REPLIED
          await prisma.emailDraft.update({
            where: { id: originalEmail.id },
            data: { status: 'REPLIED' },
          });

          // Create REPLY event
          await prisma.emailEvent.create({
            data: {
              emailDraftId: originalEmail.id,
              eventType: 'REPLY',
              providerMessageId: mail.messageId,
              eventPayload: {
                fromEmail: fromParsed.email,
                fromName: fromParsed.name,
                subject: mail.commonHeaders.subject,
                receivedAt: mail.timestamp,
              },
            },
          });

          logger.info('Reply detected, updated original email', {
            originalEmailId: originalEmail.id,
            threadId,
          });
        }
      }

      // Find contact by email
      const contact = await prisma.contact.findUnique({
        where: { email: fromParsed.email },
      });

      // Extract text content from raw email (simplified - in production, use a proper email parser)
      let bodyText = '';
      let bodyHtml = '';

      if (content) {
        // Very basic extraction - in production, use a library like mailparser
        const textMatch = content.match(/Content-Type: text\/plain[\s\S]*?\r\n\r\n([\s\S]*?)(?=--|\r\n\r\n)/);
        if (textMatch) {
          bodyText = textMatch[1].trim();
        }

        const htmlMatch = content.match(/Content-Type: text\/html[\s\S]*?\r\n\r\n([\s\S]*?)(?=--|\r\n\r\n)/);
        if (htmlMatch) {
          bodyHtml = htmlMatch[1].trim();
        }

        // If no multipart, try to extract plain content
        if (!bodyText && !bodyHtml) {
          const bodyMatch = content.match(/\r\n\r\n([\s\S]*)$/);
          if (bodyMatch) {
            bodyText = bodyMatch[1].trim();
          }
        }
      }

      // Create inbound email record
      const inboundEmail = await prisma.inboundEmail.create({
        data: {
          sesMessageId: mail.messageId,
          fromEmail: fromParsed.email,
          fromName: fromParsed.name,
          toEmail: toEmail || '',
          subject: mail.commonHeaders.subject || '(No Subject)',
          bodyText: bodyText || null,
          bodyHtml: bodyHtml || null,
          inReplyTo: inReplyTo || null,
          references: references || null,
          threadId,
          originalEmailId: originalEmail?.id || null,
          contactId: contact?.id || null,
          businessId: contact?.businessId || originalEmail?.businessId || null,
          sesIdentityId: sesIdentity?.id || null,
          isRead: false,
          isArchived: false,
          isStarred: false,
          rawPayload: JSON.parse(JSON.stringify(notification)),
          receivedAt: new Date(mail.timestamp),
        },
      });

      logger.info('Inbound email processed', {
        inboundEmailId: inboundEmail.id,
        from: fromParsed.email,
        subject: mail.commonHeaders.subject,
        isReply: !!originalEmail,
        spamVerdict: receipt.spamVerdict.status,
        virusVerdict: receipt.virusVerdict.status,
      });

      return jsonResponse(
        {
          success: true,
          inboundEmailId: inboundEmail.id,
        },
        { requestId }
      );
    }

    // Unsubscribe notification
    if (snsMessage.Type === 'UnsubscribeConfirmation') {
      logger.info('SNS unsubscribe confirmation received', {
        topicArn: snsMessage.TopicArn,
      });
      return jsonResponse({ message: 'Unsubscribe confirmation received' }, { requestId });
    }

    logger.warn('Unknown SNS message type', { type: snsMessage.Type });
    return jsonResponse({ message: 'Unknown message type' }, { requestId });
  }
);

// GET /api/webhooks/ses-inbound - Health check
export const GET = createApiHandler(
  async (_request: NextRequest, { logger, requestId }) => {
    logger.debug('SES inbound webhook health check');

    return jsonResponse(
      {
        status: 'ok',
        endpoint: 'SES Inbound Email Webhook',
        description: 'Receives inbound email notifications from AWS SNS',
      },
      { requestId }
    );
  }
);
