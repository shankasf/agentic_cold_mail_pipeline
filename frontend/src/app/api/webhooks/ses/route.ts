import { NextRequest } from 'next/server';
import { createApiHandler, jsonResponse } from '@/lib/api-utils';
import { handleEmailEvent } from '@/lib/email-sender';

// POST /api/webhooks/ses - Handle SES event webhooks (bounce, complaint, delivery, open, click)
export const POST = createApiHandler<unknown>(
  async (request: NextRequest, { logger, requestId }) => {
    const body = await request.json();

    // Handle SNS subscription confirmation
    if (body.Type === 'SubscriptionConfirmation') {
      logger.info('SNS subscription confirmation received', {
        topicArn: body.TopicArn,
      });
      if (body.SubscribeURL) {
        await fetch(body.SubscribeURL);
        logger.info('SNS subscription confirmed');
      }
      return jsonResponse({ message: 'Subscription confirmed' }, { requestId });
    }

    // Handle SNS notification
    if (body.Type === 'Notification') {
      let message;
      try {
        message = JSON.parse(body.Message);
      } catch (parseError) {
        logger.error('Failed to parse SNS message', parseError, {
          rawMessagePreview: String(body.Message).substring(0, 200),
        });
        return jsonResponse({ error: 'Invalid message format' }, { status: 400, requestId });
      }

      const eventType = message.eventType || message.notificationType;
      const mail = message.mail;
      const messageId = mail?.messageId;

      logger.debug('Processing SES event', { eventType, messageId });

      switch (eventType) {
        case 'Bounce': {
          const bounce = message.bounce;
          for (const recipient of bounce.bouncedRecipients) {
            await handleEmailEvent('bounce', recipient.emailAddress, messageId, {
              bounceType: bounce.bounceType,
              bounceSubType: bounce.bounceSubType,
              diagnosticCode: recipient.diagnosticCode,
            });
          }
          logger.info('Bounce event processed', {
            messageId,
            bounceType: bounce.bounceType,
            recipientCount: bounce.bouncedRecipients.length,
          });
          break;
        }

        case 'Complaint': {
          const complaint = message.complaint;
          for (const recipient of complaint.complainedRecipients) {
            await handleEmailEvent('complaint', recipient.emailAddress, messageId, {
              complaintFeedbackType: complaint.complaintFeedbackType,
              complaintSubType: complaint.complaintSubType,
            });
          }
          logger.info('Complaint event processed', {
            messageId,
            complaintType: complaint.complaintFeedbackType,
            recipientCount: complaint.complainedRecipients.length,
          });
          break;
        }

        case 'Delivery': {
          const delivery = message.delivery;
          for (const recipient of delivery.recipients) {
            await handleEmailEvent('delivery', recipient, messageId, {
              processingTimeMillis: delivery.processingTimeMillis,
              smtpResponse: delivery.smtpResponse,
            });
          }
          logger.info('Delivery event processed', {
            messageId,
            recipientCount: delivery.recipients.length,
            processingTimeMillis: delivery.processingTimeMillis,
          });
          break;
        }

        case 'Open': {
          const open = message.open;
          for (const recipient of mail.destination) {
            await handleEmailEvent('open', recipient, messageId, {
              ipAddress: open.ipAddress,
              userAgent: open.userAgent,
              timestamp: open.timestamp,
            });
          }
          logger.info('Open event processed', { messageId });
          break;
        }

        case 'Click': {
          const click = message.click;
          for (const recipient of mail.destination) {
            await handleEmailEvent('click', recipient, messageId, {
              ipAddress: click.ipAddress,
              userAgent: click.userAgent,
              link: click.link,
              timestamp: click.timestamp,
            });
          }
          logger.info('Click event processed', { messageId, link: click.link });
          break;
        }

        case 'Reject': {
          for (const recipient of mail.destination) {
            await handleEmailEvent('reject', recipient, messageId, {
              reason: message.reject?.reason,
            });
          }
          logger.info('Reject event processed', {
            messageId,
            reason: message.reject?.reason,
          });
          break;
        }

        case 'Send': {
          for (const recipient of mail.destination) {
            await handleEmailEvent('send', recipient, messageId, {
              timestamp: mail.timestamp,
            });
          }
          logger.debug('Send event processed', { messageId });
          break;
        }

        case 'DeliveryDelay': {
          const delay = message.deliveryDelay;
          for (const recipient of delay.delayedRecipients) {
            await handleEmailEvent('deliveryDelay', recipient.emailAddress, messageId, {
              delayType: delay.delayType,
              expirationTime: delay.expirationTime,
              diagnosticCode: recipient.diagnosticCode,
            });
          }
          logger.info('DeliveryDelay event processed', {
            messageId,
            delayType: delay.delayType,
          });
          break;
        }

        case 'Subscription': {
          const subscription = message.subscription;
          for (const recipient of mail.destination) {
            await handleEmailEvent('subscription', recipient, messageId, {
              contactList: subscription.contactList,
              topicPreferences: subscription.topicPreferences,
              newTopicPreferences: subscription.newTopicPreferences,
            });
          }
          logger.info('Subscription event processed', { messageId });
          break;
        }

        case 'Rendering Failure':
        case 'RenderingFailure': {
          const failure = message.failure;
          for (const recipient of mail.destination) {
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
          logger.warn('Unhandled SES event type', { eventType, messageId });
      }
    }

    return jsonResponse({ message: 'Webhook processed' }, { requestId });
  }
);
