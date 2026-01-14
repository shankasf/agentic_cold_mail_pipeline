import { NextRequest, NextResponse } from 'next/server';
import { handleEmailEvent } from '@/lib/email-sender';

// POST /api/webhooks/ses - Handle SES bounce/complaint webhooks
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Handle SNS subscription confirmation
    if (body.Type === 'SubscriptionConfirmation') {
      // Automatically confirm the subscription
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
      const notificationType = message.notificationType;

      if (notificationType === 'Bounce') {
        const bounce = message.bounce;
        for (const recipient of bounce.bouncedRecipients) {
          await handleEmailEvent(
            'bounce',
            recipient.emailAddress,
            message.mail?.messageId,
            { bounceType: bounce.bounceType, bounceSubType: bounce.bounceSubType }
          );
        }
      } else if (notificationType === 'Complaint') {
        const complaint = message.complaint;
        for (const recipient of complaint.complainedRecipients) {
          await handleEmailEvent(
            'complaint',
            recipient.emailAddress,
            message.mail?.messageId,
            { complaintFeedbackType: complaint.complaintFeedbackType }
          );
        }
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
