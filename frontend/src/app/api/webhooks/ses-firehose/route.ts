import { NextRequest } from 'next/server';
import { createApiHandler, jsonResponse } from '@/lib/api-utils';
import { handleEmailEvent } from '@/lib/email-sender';
import { Logger } from '@/lib/logger';

// Access key for Firehose authentication (set this in AWS Firehose settings)
const FIREHOSE_ACCESS_KEY = process.env.FIREHOSE_ACCESS_KEY || '';

interface FirehoseRecord {
  data: string; // base64 encoded
}

interface FirehoseRequest {
  requestId: string;
  timestamp: number;
  records: FirehoseRecord[];
}

// Process a single SES event from Firehose
async function processFirehoseEvent(
  message: Record<string, unknown>,
  logger: Logger
): Promise<void> {
  const eventType = (message.eventType || message.notificationType) as string;
  const mail = message.mail as Record<string, unknown> | undefined;
  const messageId = mail?.messageId as string | undefined;

  if (!eventType) {
    logger.debug('Skipping record without eventType');
    return;
  }

  switch (eventType) {
    case 'Bounce': {
      const bounce = message.bounce as Record<string, unknown>;
      const recipients = (bounce?.bouncedRecipients as Array<Record<string, string>>) || [];
      for (const recipient of recipients) {
        await handleEmailEvent('bounce', recipient.emailAddress, messageId, {
          bounceType: bounce?.bounceType,
          bounceSubType: bounce?.bounceSubType,
          diagnosticCode: recipient.diagnosticCode,
        });
      }
      logger.info('Bounce event processed', {
        messageId,
        bounceType: bounce?.bounceType,
        recipientCount: recipients.length,
      });
      break;
    }

    case 'Complaint': {
      const complaint = message.complaint as Record<string, unknown>;
      const recipients = (complaint?.complainedRecipients as Array<Record<string, string>>) || [];
      for (const recipient of recipients) {
        await handleEmailEvent('complaint', recipient.emailAddress, messageId, {
          complaintFeedbackType: complaint?.complaintFeedbackType,
          complaintSubType: complaint?.complaintSubType,
        });
      }
      logger.info('Complaint event processed', {
        messageId,
        complaintType: complaint?.complaintFeedbackType,
        recipientCount: recipients.length,
      });
      break;
    }

    case 'Delivery': {
      const delivery = message.delivery as Record<string, unknown>;
      const recipients = (delivery?.recipients as string[]) || [];
      for (const recipient of recipients) {
        await handleEmailEvent('delivery', recipient, messageId, {
          processingTimeMillis: delivery?.processingTimeMillis,
          smtpResponse: delivery?.smtpResponse,
        });
      }
      logger.info('Delivery event processed', {
        messageId,
        recipientCount: recipients.length,
      });
      break;
    }

    case 'Open': {
      const open = message.open as Record<string, unknown>;
      const destinations = (mail?.destination as string[]) || [];
      for (const recipient of destinations) {
        await handleEmailEvent('open', recipient, messageId, {
          ipAddress: open?.ipAddress,
          userAgent: open?.userAgent,
          timestamp: open?.timestamp,
        });
      }
      logger.info('Open event processed', { messageId });
      break;
    }

    case 'Click': {
      const click = message.click as Record<string, unknown>;
      const destinations = (mail?.destination as string[]) || [];
      for (const recipient of destinations) {
        await handleEmailEvent('click', recipient, messageId, {
          ipAddress: click?.ipAddress,
          userAgent: click?.userAgent,
          link: click?.link,
          timestamp: click?.timestamp,
        });
      }
      logger.info('Click event processed', { messageId, link: click?.link });
      break;
    }

    case 'Reject': {
      const destinations = (mail?.destination as string[]) || [];
      const reject = message.reject as Record<string, unknown>;
      for (const recipient of destinations) {
        await handleEmailEvent('reject', recipient, messageId, {
          reason: reject?.reason,
        });
      }
      logger.info('Reject event processed', { messageId, reason: reject?.reason });
      break;
    }

    case 'Send': {
      const destinations = (mail?.destination as string[]) || [];
      for (const recipient of destinations) {
        await handleEmailEvent('send', recipient, messageId, {
          timestamp: mail?.timestamp,
        });
      }
      logger.debug('Send event processed', { messageId });
      break;
    }

    case 'DeliveryDelay': {
      const delay = message.deliveryDelay as Record<string, unknown>;
      const recipients = (delay?.delayedRecipients as Array<Record<string, string>>) || [];
      for (const recipient of recipients) {
        await handleEmailEvent('deliveryDelay', recipient.emailAddress, messageId, {
          delayType: delay?.delayType,
          expirationTime: delay?.expirationTime,
          diagnosticCode: recipient.diagnosticCode,
        });
      }
      logger.info('DeliveryDelay event processed', {
        messageId,
        delayType: delay?.delayType,
      });
      break;
    }

    case 'Subscription': {
      const subscription = message.subscription as Record<string, unknown>;
      const destinations = (mail?.destination as string[]) || [];
      for (const recipient of destinations) {
        await handleEmailEvent('subscription', recipient, messageId, {
          contactList: subscription?.contactList,
          topicPreferences: subscription?.topicPreferences,
          newTopicPreferences: subscription?.newTopicPreferences,
        });
      }
      logger.info('Subscription event processed', { messageId });
      break;
    }

    case 'Rendering Failure':
    case 'RenderingFailure': {
      const failure = message.failure as Record<string, unknown>;
      const destinations = (mail?.destination as string[]) || [];
      for (const recipient of destinations) {
        await handleEmailEvent('renderingFailure', recipient, messageId, {
          templateName: failure?.templateName,
          errorMessage: failure?.errorMessage,
        });
      }
      logger.error('RenderingFailure event processed', null, {
        messageId,
        templateName: failure?.templateName,
        errorMessage: failure?.errorMessage,
      });
      break;
    }

    default:
      logger.warn('Unhandled SES event type from Firehose', { eventType, messageId });
  }
}

// POST /api/webhooks/ses-firehose - Handle SES events from AWS Data Firehose
export const POST = createApiHandler(
  async (request: NextRequest, { logger, requestId }) => {
    const timestamp = Date.now();
    let firehoseRequestId = requestId; // Use our requestId as default

    // Validate access key if configured
    if (FIREHOSE_ACCESS_KEY) {
      const accessKey = request.headers.get('X-Amz-Firehose-Access-Key');
      if (accessKey !== FIREHOSE_ACCESS_KEY) {
        logger.warn('Invalid Firehose access key');
        // Firehose expects this specific response format
        return jsonResponse(
          {
            requestId: firehoseRequestId,
            timestamp,
            errorMessage: 'Unauthorized: Invalid access key',
          },
          { status: 401, requestId }
        );
      }
    }

    const body: FirehoseRequest = await request.json();
    const { records } = body;

    // Use the requestId from Firehose (must echo it back)
    if (body.requestId) {
      firehoseRequestId = body.requestId;
    }

    if (!records || !Array.isArray(records)) {
      logger.error('Invalid Firehose request: missing records array', null, {
        firehoseRequestId,
      });
      return jsonResponse(
        {
          requestId: firehoseRequestId,
          timestamp,
          errorMessage: 'Invalid request: missing records array',
        },
        { status: 400, requestId }
      );
    }

    logger.debug('Processing Firehose batch', {
      firehoseRequestId,
      recordCount: records.length,
    });

    let processedCount = 0;
    let errorCount = 0;

    // Process each record from Firehose
    for (const record of records) {
      try {
        // Decode base64 data
        const decodedData = Buffer.from(record.data, 'base64').toString('utf-8');

        // Parse the JSON message (each record may contain one or more newline-separated events)
        const lines = decodedData.trim().split('\n');

        for (const line of lines) {
          if (!line.trim()) continue;

          let message;
          try {
            message = JSON.parse(line);
          } catch (parseError) {
            logger.error('Failed to parse Firehose record', parseError, {
              rawDataPreview: line.substring(0, 200),
            });
            errorCount++;
            continue;
          }

          await processFirehoseEvent(message, logger);
          processedCount++;
        }
      } catch (recordError) {
        logger.error('Error processing Firehose record', recordError);
        errorCount++;
      }
    }

    logger.info('Firehose batch processed', {
      firehoseRequestId,
      processedCount,
      errorCount,
    });

    // Firehose expects this specific response format
    return jsonResponse(
      {
        requestId: firehoseRequestId,
        timestamp,
      },
      { requestId }
    );
  }
);

// GET endpoint for health checks
export const GET = createApiHandler(
  async (_request: NextRequest, { logger, requestId }) => {
    logger.debug('SES Firehose webhook health check');

    return jsonResponse(
      {
        status: 'ok',
        endpoint: 'SES Firehose Webhook',
        timestamp: new Date().toISOString(),
      },
      { requestId }
    );
  }
);
