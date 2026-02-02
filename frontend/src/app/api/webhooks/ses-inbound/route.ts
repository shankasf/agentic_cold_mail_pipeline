import { NextRequest } from 'next/server';
import { createApiHandler, jsonResponse, Errors } from '@/lib/api-utils';
import prisma from '@/lib/prisma';
import { trackEmailReplied } from '@/lib/validated-email-tracker';
import { fetchAndParseEmailFromS3, ParsedEmail, ParsedAttachment } from '@/lib/s3-email';
import { s3Storage } from '@/lib/storage';

// Lambda S3 event payload
interface LambdaS3Event {
  bucket: string;
  key: string;
  eventTime: string;
}

// Store attachments in S3 and create database records
async function storeAttachments(
  inboundEmailId: string,
  attachments: ParsedAttachment[],
  logger: any
): Promise<void> {
  const bucket = s3Storage.getDefaultBucket();

  for (const attachment of attachments) {
    try {
      // Generate storage path
      const storagePath = s3Storage.generateAttachmentPath(inboundEmailId, attachment.filename);

      // Save to S3
      const saveResult = await s3Storage.saveToBucket(
        bucket,
        storagePath,
        attachment.content,
        { contentType: attachment.contentType }
      );

      if (!saveResult.success) {
        logger.error('Failed to save attachment to S3', null, {
          filename: attachment.filename,
          error: saveResult.error,
        });
        continue;
      }

      // Create database record
      await prisma.emailAttachment.create({
        data: {
          inboundEmailId,
          filename: attachment.filename,
          contentType: attachment.contentType,
          sizeBytes: attachment.size,
          storagePath: `s3://${bucket}/${storagePath}`,
          storageType: 's3',
          contentId: attachment.contentId,
          isInline: attachment.isInline,
        },
      });

      logger.debug('Attachment stored', {
        filename: attachment.filename,
        size: attachment.size,
        isInline: attachment.isInline,
      });
    } catch (error) {
      logger.error('Failed to store attachment', error, {
        filename: attachment.filename,
      });
    }
  }
}

// Process parsed email and store in database
async function processInboundEmail(
  parsedEmail: ParsedEmail,
  s3BucketName: string,
  s3ObjectKey: string,
  eventTime: string,
  logger: any
): Promise<{ inboundEmailId: string; attachmentCount: number }> {
  // Extract from address
  const fromParsed = parsedEmail.from || { name: null, email: 'unknown@unknown.com' };

  // Get the recipient (our SES identity)
  const toEmail = parsedEmail.to?.[0]?.toLowerCase() || '';

  // Find the SES identity this email was sent to
  const sesIdentity = toEmail
    ? await prisma.sESIdentity.findUnique({
        where: { emailAddress: toEmail },
      })
    : null;

  // Find the original email if this is a reply
  let originalEmail = null;
  let threadId = null;

  if (parsedEmail.inReplyTo) {
    // Try to find by SES message ID (format: <message-id>)
    const cleanMessageId = parsedEmail.inReplyTo.replace(/[<>]/g, '');
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
          providerMessageId: parsedEmail.messageId || s3ObjectKey,
          eventPayload: {
            fromEmail: fromParsed.email,
            fromName: fromParsed.name,
            subject: parsedEmail.subject,
            receivedAt: eventTime,
          },
        },
      });

      // Track reply in validated email businesses
      if (originalEmail.businessId) {
        try {
          await trackEmailReplied(originalEmail.businessId);
        } catch (e) {
          logger.error('Error tracking reply for validation', e);
        }
      }

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

  // Determine if email has attachments
  const hasAttachments = (parsedEmail.attachments?.length || 0) > 0;

  // Create inbound email record
  const inboundEmail = await prisma.inboundEmail.create({
    data: {
      sesMessageId: parsedEmail.messageId || s3ObjectKey,
      fromEmail: fromParsed.email,
      fromName: fromParsed.name,
      toEmail: toEmail || '',
      subject: parsedEmail.subject || '(No Subject)',
      bodyText: parsedEmail.text || null,
      bodyHtml: parsedEmail.html || null,
      inReplyTo: parsedEmail.inReplyTo || null,
      references: parsedEmail.references || null,
      threadId,
      originalEmailId: originalEmail?.id || null,
      contactId: contact?.id || null,
      businessId: contact?.businessId || originalEmail?.businessId || null,
      sesIdentityId: sesIdentity?.id || null,
      isRead: false,
      isArchived: false,
      isStarred: false,
      rawPayload: { source: 'lambda', bucket: s3BucketName, key: s3ObjectKey },
      s3BucketName,
      s3ObjectKey,
      hasAttachments,
      receivedAt: new Date(eventTime),
    },
  });

  // Store attachments if any
  if (parsedEmail.attachments && parsedEmail.attachments.length > 0) {
    logger.debug('Storing attachments', {
      count: parsedEmail.attachments.length,
      inboundEmailId: inboundEmail.id,
    });
    await storeAttachments(inboundEmail.id, parsedEmail.attachments, logger);

    // Update hasAttachments flag (in case it wasn't set correctly)
    await prisma.inboundEmail.update({
      where: { id: inboundEmail.id },
      data: { hasAttachments: true },
    });
  }

  return {
    inboundEmailId: inboundEmail.id,
    attachmentCount: parsedEmail.attachments?.length || 0,
  };
}

// POST /api/webhooks/ses-inbound - Handle inbound email notifications from Lambda
export const POST = createApiHandler<unknown>(
  async (request: NextRequest, { logger, requestId }) => {
    // Check for Lambda secret header
    const lambdaSecret = request.headers.get('X-Lambda-Secret');

    if (!lambdaSecret) {
      throw Errors.unauthorized('Missing X-Lambda-Secret header');
    }

    if (lambdaSecret !== process.env.LAMBDA_INBOUND_SECRET) {
      throw Errors.unauthorized('Invalid Lambda secret');
    }

    // Parse Lambda payload
    let payload: LambdaS3Event;
    try {
      payload = await request.json();
    } catch {
      logger.error('Failed to parse Lambda payload');
      return jsonResponse({ error: 'Invalid JSON' }, { status: 400, requestId });
    }

    const { bucket, key, eventTime } = payload;

    if (!bucket || !key) {
      logger.error('Missing bucket or key in payload', null, { payload });
      return jsonResponse({ error: 'Missing bucket or key' }, { status: 400, requestId });
    }

    logger.debug('Processing inbound email from Lambda', {
      bucket,
      key,
      eventTime,
    });

    // Fetch and parse email from S3
    const s3Result = await fetchAndParseEmailFromS3(bucket, key);

    if (!s3Result.success || !s3Result.data) {
      logger.error('Failed to fetch/parse email from S3', null, {
        bucket,
        key,
        error: s3Result.error,
      });
      return jsonResponse(
        { error: 'Failed to process email', details: s3Result.error },
        { status: 500, requestId }
      );
    }

    const parsedEmail = s3Result.data;

    logger.debug('Email parsed from S3', {
      from: parsedEmail.from?.email,
      subject: parsedEmail.subject,
      attachmentCount: parsedEmail.attachments?.length || 0,
    });

    // Process and store the email
    const result = await processInboundEmail(parsedEmail, bucket, key, eventTime, logger);

    logger.info('Inbound email processed', {
      inboundEmailId: result.inboundEmailId,
      from: parsedEmail.from?.email,
      subject: parsedEmail.subject,
      hasAttachments: result.attachmentCount > 0,
      attachmentCount: result.attachmentCount,
    });

    return jsonResponse(
      {
        success: true,
        inboundEmailId: result.inboundEmailId,
        attachmentCount: result.attachmentCount,
      },
      { requestId }
    );
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
        description: 'Receives inbound email notifications from AWS Lambda (S3 trigger)',
      },
      { requestId }
    );
  }
);
