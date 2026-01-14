import nodemailer from 'nodemailer';
import prisma from './prisma';
import { startOfDay } from 'date-fns';

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

    // Send via SMTP
    const info = await transporter.sendMail({
      from: `${email.fromName} <${email.fromEmail}>`,
      to: email.contact.email,
      subject: email.subject,
      text: fullBody,
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

// Process bounce/complaint webhook
export async function handleEmailEvent(
  type: 'bounce' | 'complaint',
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
          status: 'SENT',
        },
        orderBy: { updatedAt: 'desc' },
      });
    }
  }

  // Update email status if found
  if (emailDraft) {
    await prisma.emailDraft.update({
      where: { id: emailDraft.id },
      data: { status: type === 'bounce' ? 'BOUNCED' : 'COMPLAINT' },
    });

    await prisma.emailEvent.create({
      data: {
        emailDraftId: emailDraft.id,
        eventType: type === 'bounce' ? 'BOUNCE' : 'COMPLAINT',
        providerMessageId,
        eventPayload: (payload || {}) as object,
      },
    });
  }

  // Add to suppression list
  await suppressEmail(email, type === 'bounce' ? 'BOUNCE' : 'COMPLAINT');
}
