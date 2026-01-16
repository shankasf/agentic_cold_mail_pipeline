import nodemailer from 'nodemailer';
import prisma from './prisma';
import { startOfDay } from 'date-fns';

// Generate professional HTML email from plain text
function generateHtmlEmail(bodyText: string, footerText: string, senderName: string): string {
  // Convert plain text to HTML paragraphs
  const bodyHtml = bodyText
    .split('\n\n')
    .map(paragraph => {
      // Check if paragraph contains a URL and make it clickable
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const linkedParagraph = paragraph.replace(urlRegex, '<a href="$1" style="color: #4f46e5; text-decoration: none;">$1</a>');
      return `<p style="margin: 0 0 16px 0; line-height: 1.6;">${linkedParagraph.replace(/\n/g, '<br>')}</p>`;
    })
    .join('');

  const footerHtml = footerText
    ? footerText
        .split('\n')
        .map(line => `<p style="margin: 0; line-height: 1.5;">${line}</p>`)
        .join('')
    : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Email from ${senderName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; color: #333333; background-color: #f5f5f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
          <!-- Email Body -->
          <tr>
            <td style="padding: 40px 40px 30px 40px;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          ${footerHtml ? `
          <tr>
            <td style="padding: 0 40px 40px 40px; border-top: 1px solid #eeeeee; padding-top: 20px;">
              <div style="font-size: 14px; color: #666666;">
                ${footerHtml}
              </div>
            </td>
          </tr>
          ` : ''}
          <!-- Unsubscribe -->
          <tr>
            <td style="padding: 20px 40px; background-color: #fafafa; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; font-size: 12px; color: #999999; text-align: center;">
                If you no longer wish to receive these emails, simply reply with "Unsubscribe" in the subject line.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

// Create SMTP transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'email-smtp.us-east-1.amazonaws.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Check if we've hit the daily cap
async function checkDailyCap(): Promise<{ canSend: boolean; sent: number; cap: number }> {
  const settings = await prisma.adminSettings.findFirst();
  const cap = settings?.sendingCapPerDay ?? 100;

  const todayStart = startOfDay(new Date());
  const sent = await prisma.emailDraft.count({
    where: {
      status: 'SENT',
      updatedAt: { gte: todayStart },
    },
  });

  return {
    canSend: sent < cap,
    sent,
    cap,
  };
}

// Check if email is in suppression list
async function isEmailSuppressed(email: string): Promise<boolean> {
  const suppressed = await prisma.suppressionList.findUnique({
    where: { email },
  });
  return !!suppressed;
}

// Send a single email
export async function sendEmail(emailDraftId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Check daily cap
    const capStatus = await checkDailyCap();
    if (!capStatus.canSend) {
      return {
        success: false,
        error: `Daily sending cap reached (${capStatus.sent}/${capStatus.cap})`,
      };
    }

    // Get email draft
    const email = await prisma.emailDraft.findUnique({
      where: { id: emailDraftId },
      include: {
        contact: true,
        business: true,
      },
    });

    if (!email) {
      return { success: false, error: 'Email draft not found' };
    }

    if (email.status !== 'APPROVED') {
      return { success: false, error: `Email status is ${email.status}, not APPROVED` };
    }

    // Check suppression list
    if (await isEmailSuppressed(email.contact.email)) {
      return { success: false, error: 'Email is in suppression list' };
    }

    // Compose full email body with footer
    const fullBody = `${email.bodyText}\n\n${email.footerText}`;

    // Generate HTML version of the email
    const htmlBody = generateHtmlEmail(email.bodyText, email.footerText, email.fromName);

    // Generate unsubscribe link (using mailto for simplicity)
    const unsubscribeEmail = email.fromEmail;
    const unsubscribeLink = `mailto:${unsubscribeEmail}?subject=Unsubscribe&body=Please%20remove%20me%20from%20your%20mailing%20list.`;

    // Send via SMTP with proper headers
    const info = await transporter.sendMail({
      from: `${email.fromName} <${email.fromEmail}>`,
      to: email.contact.email,
      replyTo: email.fromEmail,
      subject: email.subject,
      text: fullBody,
      html: htmlBody,
      headers: {
        'List-Unsubscribe': `<${unsubscribeLink}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Priority': '3',
        'X-Mailer': 'CallSphere Mailer',
      },
    });

    // Update email status
    await prisma.emailDraft.update({
      where: { id: emailDraftId },
      data: { status: 'SENT' },
    });

    // Record event
    await prisma.emailEvent.create({
      data: {
        emailDraftId,
        eventType: 'SENT',
        providerMessageId: info.messageId,
        eventPayload: { response: info.response },
      },
    });

    return { success: true };
  } catch (error) {
    console.error('Error sending email:', error);

    // Record failed attempt
    await prisma.emailEvent.create({
      data: {
        emailDraftId,
        eventType: 'BOUNCE', // Treat send failures as bounces
        eventPayload: { error: String(error) },
      },
    });

    return { success: false, error: String(error) };
  }
}

// Add email to suppression list
export async function suppressEmail(
  email: string,
  reason: 'BOUNCE' | 'COMPLAINT' | 'MANUAL'
): Promise<void> {
  await prisma.suppressionList.upsert({
    where: { email },
    update: { reason },
    create: { email, reason },
  });
}

// Map SES event type to EmailEventType enum
type SESEventType = 'bounce' | 'complaint' | 'delivery' | 'open' | 'click' | 'reject' | 'send' | 'deliveryDelay' | 'subscription' | 'renderingFailure';

const eventTypeMap: Record<SESEventType, string> = {
  bounce: 'BOUNCE',
  complaint: 'COMPLAINT',
  delivery: 'DELIVERED',
  open: 'OPEN',
  click: 'CLICK',
  reject: 'REJECT',
  send: 'SENT',
  deliveryDelay: 'DELIVERY_DELAY',
  subscription: 'SUBSCRIPTION',
  renderingFailure: 'RENDERING_FAILURE',
};

// Process SES webhook events
export async function handleEmailEvent(
  type: SESEventType,
  email: string,
  providerMessageId?: string,
  payload?: Record<string, unknown>
): Promise<void> {
  // Find the email draft by provider message ID or email
  let emailDraft;

  if (providerMessageId) {
    const event = await prisma.emailEvent.findFirst({
      where: { providerMessageId },
      include: { emailDraft: true },
    });
    emailDraft = event?.emailDraft;
  }

  if (!emailDraft) {
    // Try to find by contact email
    const contact = await prisma.contact.findUnique({
      where: { email },
    });
    if (contact) {
      emailDraft = await prisma.emailDraft.findFirst({
        where: {
          contactId: contact.id,
          status: { in: ['SENT', 'APPROVED'] },
        },
        orderBy: { updatedAt: 'desc' },
      });
    }
  }

  // Record the event if email draft found
  if (emailDraft) {
    // Update email status for certain events
    if (type === 'bounce' || type === 'reject') {
      await prisma.emailDraft.update({
        where: { id: emailDraft.id },
        data: { status: 'BOUNCED' },
      });
    } else if (type === 'complaint') {
      await prisma.emailDraft.update({
        where: { id: emailDraft.id },
        data: { status: 'COMPLAINT' },
      });
    }

    // Create event record
    await prisma.emailEvent.create({
      data: {
        emailDraftId: emailDraft.id,
        eventType: eventTypeMap[type] as any,
        providerMessageId,
        eventPayload: (payload || {}) as object,
      },
    });
  }

  // Add to suppression list for bounces and complaints only
  // Note: 'reject' means virus detected - not the recipient's fault
  if (type === 'bounce') {
    await suppressEmail(email, 'BOUNCE');
  } else if (type === 'complaint') {
    await suppressEmail(email, 'COMPLAINT');
  }
}
