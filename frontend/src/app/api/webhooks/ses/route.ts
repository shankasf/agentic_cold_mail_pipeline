import { NextRequest, NextResponse } from 'next/server';
import { handleEmailEvent } from '@/lib/email-sender';

// POST /api/webhooks/ses - Handle SES event webhooks (bounce, complaint, delivery, open, click)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Handle SNS subscription confirmation
    if (body.Type === 'SubscriptionConfirmation') {
      if (body.SubscribeURL) {
        await fetch(body.SubscribeURL);
      }
      return NextResponse.json({ message: 'Subscription confirmed' });
    }

    // Handle SNS notification
    if (body.Type === 'Notification') {
      let message;
      try {
        message = JSON.parse(body.Message);
      } catch (parseError) {
        console.error('Failed to parse SNS message:', parseError, 'Raw message:', body.Message);
        return NextResponse.json({ error: 'Invalid message format' }, { status: 400 });
      }

      const eventType = message.eventType || message.notificationType;
      const mail = message.mail;
      const messageId = mail?.messageId;

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
          break;
        }

        case 'Reject': {
          for (const recipient of mail.destination) {
            await handleEmailEvent('reject', recipient, messageId, {
              reason: message.reject?.reason,
            });
          }
          break;
        }

        case 'Send': {
          for (const recipient of mail.destination) {
            await handleEmailEvent('send', recipient, messageId, {
              timestamp: mail.timestamp,
            });
          }
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
          break;
        }

        default:
          console.log('Unhandled SES event type:', eventType);
      }
    }

    return NextResponse.json({ message: 'Webhook processed' });
  } catch (error) {
    console.error('Error processing SES webhook:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
