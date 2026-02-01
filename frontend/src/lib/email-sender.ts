import nodemailer from 'nodemailer';
import prisma from './prisma';
import { startOfDay } from 'date-fns';
import { publishEmailEvent } from './redis';
import { SESIdentity } from '@prisma/client';
import { validateEmail, getValidationSummary } from './pre-send-validation';

/**
 * Find an SES identity for a given email address.
 * First tries exact email match, then falls back to domain identity.
 */
async function findIdentityForEmail(email: string): Promise<SESIdentity | null> {
  // Try exact email match first
  let identity = await prisma.sESIdentity.findUnique({
    where: { emailAddress: email },
  });

  if (identity) {
    return identity;
  }

  // Try domain match (e.g., @callsphere.tech)
  const domain = email.split('@')[1];
  if (domain) {
    identity = await prisma.sESIdentity.findFirst({
      where: {
        emailAddress: `@${domain}`,
        identityType: 'DOMAIN',
        status: { in: ['VERIFIED', 'ACTIVE', 'WARMING'] },
      },
    });
  }

  return identity;
}

// Protected identities - these are primary/main emails that should only be used as last resort
// to preserve their reputation and keep them available for important communications
const PROTECTED_IDENTITIES = [
  'sagar@callsphere.tech',
];

// Reputation thresholds for smart rotation
const REPUTATION_THRESHOLDS = {
  GOOD: 2,      // Bounce rate < 2% is good
  MODERATE: 5,  // Bounce rate < 5% is moderate
  POOR: 10,     // Bounce rate > 10% is poor
};

/**
 * Get all available SES identities with remaining quota.
 * Returns identities sorted by priority:
 * 1. Non-protected identities with most remaining quota first
 * 2. Protected identities last (only used as fallback)
 */
export async function getAvailableIdentities(includeProtected: boolean = true): Promise<SESIdentity[]> {
  const identities = await prisma.sESIdentity.findMany({
    where: {
      status: { in: ['VERIFIED', 'ACTIVE', 'WARMING'] },
      identityType: 'EMAIL', // Only email identities can send
    },
  });

  // Filter to only those with remaining quota
  const available = identities.filter(i => i.sentToday < i.dailyLimit);

  // Separate protected and non-protected identities
  const nonProtected = available.filter(i => !PROTECTED_IDENTITIES.includes(i.emailAddress));
  const protectedOnes = available.filter(i => PROTECTED_IDENTITIES.includes(i.emailAddress));

  // Sort each group by remaining quota (most remaining first)
  const sortByRemaining = (a: SESIdentity, b: SESIdentity) => {
    const remainingA = a.dailyLimit - a.sentToday;
    const remainingB = b.dailyLimit - b.sentToday;
    return remainingB - remainingA;
  };

  nonProtected.sort(sortByRemaining);
  protectedOnes.sort(sortByRemaining);

  // Return non-protected first, then protected (if included)
  return includeProtected ? [...nonProtected, ...protectedOnes] : nonProtected;
}

/**
 * Find the best available identity with remaining quota.
 * Strategy (Smart Rotation):
 * 1. First try non-protected identities using weighted selection (quota * reputation)
 * 2. Only fall back to protected identities when all others are exhausted
 * This protects primary emails (like sagar@callsphere.tech) for important communications.
 */
export async function findBestAvailableIdentity(): Promise<SESIdentity | null> {
  // First, try non-protected identities only with smart rotation
  const nonProtectedIdentities = await getAvailableIdentities(false);

  if (nonProtectedIdentities.length > 0) {
    // Use smart rotation based on reputation and remaining quota
    const selected = await selectBestIdentity(nonProtectedIdentities);
    if (selected) {
      console.log(`[Identity Router] Smart rotation selected: ${selected.emailAddress} (${selected.dailyLimit - selected.sentToday} remaining)`);
      return selected;
    }
  }

  // If no non-protected identities available, fall back to protected ones
  const allIdentities = await getAvailableIdentities(true);

  if (allIdentities.length > 0) {
    // Also use smart rotation for protected identities
    const selected = await selectBestIdentity(allIdentities);
    if (selected) {
      console.log(`[Identity Router] WARNING: Falling back to protected identity: ${selected.emailAddress}`);
      return selected;
    }
  }

  console.log('[Identity Router] ERROR: No identities available with remaining quota');
  return null;
}

/**
 * Calculate reputation score for an identity based on recent events
 * Score is 0-100, higher is better
 */
async function calculateReputationScore(identityId: string): Promise<number> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days

  // Get email events for this identity
  const [totalSent, bounced, complaints] = await Promise.all([
    prisma.emailDraft.count({
      where: {
        sesIdentityId: identityId,
        status: 'SENT',
        sentAt: { gte: since },
      },
    }),
    prisma.emailDraft.count({
      where: {
        sesIdentityId: identityId,
        status: 'BOUNCED',
        updatedAt: { gte: since },
      },
    }),
    prisma.emailDraft.count({
      where: {
        sesIdentityId: identityId,
        status: 'COMPLAINT',
        updatedAt: { gte: since },
      },
    }),
  ]);

  if (totalSent === 0) {
    return 100; // No history = perfect score (new identity)
  }

  const bounceRate = (bounced / totalSent) * 100;
  const complaintRate = (complaints / totalSent) * 100;

  // Calculate score: start at 100, deduct for bounces and complaints
  let score = 100;

  // Deduct for bounce rate (max 40 points)
  if (bounceRate >= REPUTATION_THRESHOLDS.POOR) {
    score -= 40;
  } else if (bounceRate >= REPUTATION_THRESHOLDS.MODERATE) {
    score -= 20;
  } else if (bounceRate >= REPUTATION_THRESHOLDS.GOOD) {
    score -= 10;
  }

  // Deduct for complaint rate (max 60 points - complaints are more serious)
  if (complaintRate >= 0.1) {
    score -= 60;
  } else if (complaintRate >= 0.05) {
    score -= 30;
  } else if (complaintRate >= 0.01) {
    score -= 15;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Smart identity selection using weighted scoring
 * Weight = remaining quota * reputation score
 */
export async function selectBestIdentity(
  identities: SESIdentity[]
): Promise<SESIdentity | null> {
  if (identities.length === 0) return null;

  // Calculate weights for each identity
  const weights = await Promise.all(
    identities.map(async (identity) => {
      const remaining = identity.dailyLimit - identity.sentToday;
      const reputationScore = await calculateReputationScore(identity.id);

      // Weight = remaining capacity * (reputation / 100)
      // This prioritizes identities with good reputation AND available quota
      const weight = remaining * (reputationScore / 100);

      return {
        identity,
        weight,
        remaining,
        reputationScore,
      };
    })
  );

  // Sort by weight (highest first)
  weights.sort((a, b) => b.weight - a.weight);

  // Use weighted random selection for distribution
  // This prevents always using the same identity
  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);

  if (totalWeight <= 0) {
    // Fall back to first available
    const available = weights.find(w => w.remaining > 0);
    return available?.identity || null;
  }

  // Weighted random selection
  let random = Math.random() * totalWeight;
  for (const w of weights) {
    random -= w.weight;
    if (random <= 0 && w.remaining > 0) {
      console.log(`[Smart Rotation] Selected ${w.identity.emailAddress} (weight: ${w.weight.toFixed(2)}, reputation: ${w.reputationScore}, remaining: ${w.remaining})`);
      return w.identity;
    }
  }

  // Fall back to highest weighted with capacity
  const best = weights.find(w => w.remaining > 0);
  return best?.identity || null;
}

/**
 * Get total available quota across all identities
 * Shows breakdown between protected and non-protected identities
 */
export async function getTotalAvailableQuota(): Promise<{
  totalRemaining: number;
  nonProtectedRemaining: number;
  protectedRemaining: number;
  identities: Array<{
    id: string;
    email: string;
    displayName: string;
    remaining: number;
    dailyLimit: number;
    sentToday: number;
    isProtected: boolean;
  }>;
}> {
  const identities = await getAvailableIdentities(true);

  const result = identities.map(i => ({
    id: i.id,
    email: i.emailAddress,
    displayName: i.displayName || i.emailAddress,
    remaining: i.dailyLimit - i.sentToday,
    dailyLimit: i.dailyLimit,
    sentToday: i.sentToday,
    isProtected: PROTECTED_IDENTITIES.includes(i.emailAddress),
  }));

  const nonProtectedRemaining = result
    .filter(i => !i.isProtected)
    .reduce((sum, i) => sum + i.remaining, 0);

  const protectedRemaining = result
    .filter(i => i.isProtected)
    .reduce((sum, i) => sum + i.remaining, 0);

  return {
    totalRemaining: nonProtectedRemaining + protectedRemaining,
    nonProtectedRemaining,
    protectedRemaining,
    identities: result,
  };
}

/**
 * Distribute emails EVENLY across identities to balance the load.
 * Strategy:
 * 1. Calculate total available capacity across non-protected identities
 * 2. Distribute emails proportionally based on each identity's remaining capacity
 * 3. Use round-robin within the proportional allocation to spread evenly
 * 4. Only use protected identities when non-protected are fully exhausted
 * Returns a map of emailDraftId -> identityId assignments.
 */
export async function distributeEmailsAcrossIdentities(
  emailDraftIds: string[]
): Promise<{
  assignments: Map<string, { identityId: string; fromEmail: string; fromName: string }>;
  unassigned: string[];
  quotaInfo: { totalAssigned: number; identityBreakdown: Record<string, number> };
}> {
  // Get identities in priority order (non-protected first, protected last)
  const identities = await getAvailableIdentities(true);
  const assignments = new Map<string, { identityId: string; fromEmail: string; fromName: string }>();
  const unassigned: string[] = [];
  const identityBreakdown: Record<string, number> = {};

  // Separate into non-protected and protected
  const nonProtected = identities.filter(i => !PROTECTED_IDENTITIES.includes(i.emailAddress));
  const protectedOnes = identities.filter(i => PROTECTED_IDENTITIES.includes(i.emailAddress));

  // Track how many we've assigned to each identity
  const assignedCounts: Record<string, number> = {};
  for (const identity of identities) {
    assignedCounts[identity.id] = 0;
    identityBreakdown[identity.emailAddress] = 0;
  }

  // Helper to get remaining capacity for an identity
  const getRemaining = (identity: SESIdentity) => {
    return identity.dailyLimit - identity.sentToday - assignedCounts[identity.id];
  };

  // Calculate total available capacity for non-protected identities
  const totalNonProtectedCapacity = nonProtected.reduce((sum, i) => sum + getRemaining(i), 0);
  const emailCount = emailDraftIds.length;

  console.log(`[Identity Router] Distributing ${emailCount} emails across ${nonProtected.length} non-protected identities (total capacity: ${totalNonProtectedCapacity})`);

  // Calculate how many emails each identity should get (proportional to remaining capacity)
  // Then use round-robin to assign evenly
  const identityAllocations: Map<string, number> = new Map();

  if (totalNonProtectedCapacity > 0 && nonProtected.length > 0) {
    // If we have more capacity than emails, distribute evenly
    if (totalNonProtectedCapacity >= emailCount) {
      const emailsPerIdentity = Math.floor(emailCount / nonProtected.length);
      const remainder = emailCount % nonProtected.length;

      nonProtected.forEach((identity, index) => {
        const allocation = Math.min(
          emailsPerIdentity + (index < remainder ? 1 : 0),
          getRemaining(identity)
        );
        identityAllocations.set(identity.id, allocation);
      });
    } else {
      // More emails than capacity - distribute proportionally to remaining capacity
      let remainingEmails = emailCount;
      nonProtected.forEach(identity => {
        const remaining = getRemaining(identity);
        const proportion = remaining / totalNonProtectedCapacity;
        const allocation = Math.min(Math.ceil(emailCount * proportion), remaining, remainingEmails);
        identityAllocations.set(identity.id, allocation);
        remainingEmails -= allocation;
      });
    }
  }

  // Round-robin assignment across non-protected identities
  let identityIndex = 0;
  for (const emailId of emailDraftIds) {
    let assigned = false;
    let attempts = 0;

    // Try non-protected identities (round-robin for even distribution)
    while (!assigned && attempts < nonProtected.length) {
      const identity = nonProtected[identityIndex % nonProtected.length];
      const remaining = getRemaining(identity);

      if (remaining > 0) {
        assignments.set(emailId, {
          identityId: identity.id,
          fromEmail: identity.emailAddress,
          fromName: identity.displayName || identity.emailAddress.split('@')[0],
        });
        assignedCounts[identity.id]++;
        identityBreakdown[identity.emailAddress]++;
        assigned = true;
      }

      identityIndex++;
      attempts++;
    }

    // If all non-protected are exhausted, try protected identities as last resort
    if (!assigned) {
      for (const identity of protectedOnes) {
        if (getRemaining(identity) > 0) {
          console.log(`[Identity Router] WARNING: Using protected identity ${identity.emailAddress} (non-protected exhausted)`);
          assignments.set(emailId, {
            identityId: identity.id,
            fromEmail: identity.emailAddress,
            fromName: identity.displayName || identity.emailAddress.split('@')[0],
          });
          assignedCounts[identity.id]++;
          identityBreakdown[identity.emailAddress]++;
          assigned = true;
          break;
        }
      }
    }

    if (!assigned) {
      unassigned.push(emailId);
    }
  }

  // Log distribution summary
  console.log(`[Identity Router] Distribution complete:`, {
    total: emailDraftIds.length,
    assigned: assignments.size,
    unassigned: unassigned.length,
    breakdown: identityBreakdown,
  });

  return {
    assignments,
    unassigned,
    quotaInfo: {
      totalAssigned: assignments.size,
      identityBreakdown,
    },
  };
}

/**
 * Assign identity to an email draft and update its fromEmail/fromName
 */
export async function assignIdentityToEmailDraft(
  emailDraftId: string,
  identityId: string,
  fromEmail: string,
  fromName: string
): Promise<void> {
  await prisma.emailDraft.update({
    where: { id: emailDraftId },
    data: {
      fromEmail,
      fromName,
      sesIdentityId: identityId,
    },
  });
}

/**
 * Check if identity has remaining daily quota
 */
async function checkIdentityQuota(identity: SESIdentity): Promise<{ canSend: boolean; reason?: string }> {
  if (identity.status === 'PAUSED') {
    return { canSend: false, reason: 'Identity is paused' };
  }

  if (identity.sentToday >= identity.dailyLimit) {
    return { canSend: false, reason: `Identity daily limit reached (${identity.sentToday}/${identity.dailyLimit})` };
  }

  return { canSend: true };
}

/**
 * Increment the sent count for an identity
 */
async function incrementIdentitySentCount(identityId: string): Promise<void> {
  await prisma.sESIdentity.update({
    where: { id: identityId },
    data: {
      sentToday: { increment: 1 },
      lastSentAt: new Date(),
    },
  });
}

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

    // Get email draft with parent email for threading
    const email = await prisma.emailDraft.findUnique({
      where: { id: emailDraftId },
      include: {
        contact: true,
        business: true,
        parentEmail: {
          select: {
            sesMessageId: true,
            threadId: true,
          },
        },
      },
    });

    if (!email) {
      return { success: false, error: 'Email draft not found' };
    }

    // IMPORTANT: Prevent resending - only send APPROVED emails that haven't been sent
    if (email.status === 'SENT') {
      console.log(`[sendEmail] Skipping already sent email: ${emailDraftId}`);
      return { success: true, error: 'Email already sent (skipped)' };
    }

    if (email.status === 'BOUNCED' || email.status === 'COMPLAINT') {
      console.log(`[sendEmail] Skipping ${email.status} email: ${emailDraftId}`);
      return { success: false, error: `Email status is ${email.status}, cannot resend` };
    }

    if (email.status !== 'APPROVED') {
      return { success: false, error: `Email status is ${email.status}, not APPROVED` };
    }

    // Double-check: if sentAt is set, email was already sent
    if (email.sentAt) {
      console.log(`[sendEmail] Skipping email with sentAt timestamp: ${emailDraftId}`);
      return { success: true, error: 'Email already sent (skipped)' };
    }

    // Check suppression list
    if (await isEmailSuppressed(email.contact.email)) {
      return { success: false, error: 'Email is in suppression list' };
    }

    // Find identity - try assigned identity first, then fromEmail match, then auto-assign
    let identity = email.sesIdentityId
      ? await prisma.sESIdentity.findUnique({ where: { id: email.sesIdentityId } })
      : await findIdentityForEmail(email.fromEmail);

    // Check if we need to auto-assign a different identity
    let needsAutoAssign = false;
    if (!identity) {
      needsAutoAssign = true;
    } else {
      const quotaCheck = await checkIdentityQuota(identity);
      if (!quotaCheck.canSend) {
        needsAutoAssign = true;
      }
    }

    // Auto-assign best available identity if needed
    if (needsAutoAssign) {
      const newIdentity = await findBestAvailableIdentity();
      if (!newIdentity) {
        return { success: false, error: 'No SES identity available with remaining quota' };
      }
      identity = newIdentity;

      // Update the email draft with the new identity
      await prisma.emailDraft.update({
        where: { id: emailDraftId },
        data: {
          fromEmail: identity.emailAddress,
          fromName: identity.displayName || identity.emailAddress.split('@')[0],
          sesIdentityId: identity.id,
        },
      });

      // Refresh email data
      email.fromEmail = identity.emailAddress;
      email.fromName = identity.displayName || identity.emailAddress.split('@')[0];
    }

    // At this point identity is guaranteed to be non-null
    if (!identity) {
      return { success: false, error: 'No SES identity available' };
    }

    // Final quota check (in case of race condition)
    const quotaCheck = await checkIdentityQuota(identity);
    if (!quotaCheck.canSend) {
      return { success: false, error: quotaCheck.reason };
    }

    // Compose full email body (footer should be empty, but include if present for backward compatibility)
    const fullBody = email.footerText ? `${email.bodyText}\n\n${email.footerText}` : email.bodyText;

    // Generate HTML version of the email (pass empty string for footer to avoid any address)
    const htmlBody = generateHtmlEmail(email.bodyText, '', email.fromName);

    // Pre-send validation
    const validation = validateEmail({
      toEmail: email.contact.email,
      fromEmail: email.fromEmail,
      subject: email.subject,
      bodyText: fullBody,
      bodyHtml: htmlBody,
    });

    if (!validation.valid) {
      console.log(`[sendEmail] Pre-send validation failed for ${emailDraftId}: ${getValidationSummary(validation)}`);
      return {
        success: false,
        error: `Validation failed: ${validation.errors.map(e => e.message).join(', ')}`,
      };
    }

    if (validation.warnings.length > 0) {
      console.log(`[sendEmail] Pre-send validation warnings for ${emailDraftId}: ${validation.warnings.map(w => w.message).join(', ')}`);
    }

    // Generate unsubscribe link (using mailto for simplicity)
    const unsubscribeEmail = email.fromEmail;
    const unsubscribeLink = `mailto:${unsubscribeEmail}?subject=Unsubscribe&body=Please%20remove%20me%20from%20your%20mailing%20list.`;

    // Build headers - include threading headers for follow-up emails
    const headers: Record<string, string> = {
      'List-Unsubscribe': `<${unsubscribeLink}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      'X-Priority': '3',
      'X-Mailer': 'CallSphere Mailer',
    };

    // Add threading headers if this is a follow-up email
    if (email.parentEmail?.sesMessageId) {
      const parentMessageId = email.parentEmail.sesMessageId;
      // In-Reply-To header tells email clients this is a reply to the immediate parent
      headers['In-Reply-To'] = `<${parentMessageId}>`;

      // Build References header with all message IDs in the thread chain
      // This ensures proper threading even for long email chains
      const references: string[] = [];
      if (email.threadId) {
        // Get all sent emails in this thread to build full References chain
        const threadEmails = await prisma.emailDraft.findMany({
          where: {
            threadId: email.threadId,
            sesMessageId: { not: null },
            status: 'SENT',
          },
          select: { sesMessageId: true },
          orderBy: { sentAt: 'asc' },
        });
        references.push(...threadEmails.map(e => `<${e.sesMessageId}>`));
      } else {
        // Fallback: just use parent message ID
        references.push(`<${parentMessageId}>`);
      }

      if (references.length > 0) {
        headers['References'] = references.join(' ');
      }

      console.log(`[sendEmail] Threading follow-up to parent message: ${parentMessageId}, thread references: ${references.length}`);
    }

    // Send via SMTP with proper headers
    const info = await transporter.sendMail({
      from: `${email.fromName} <${email.fromEmail}>`,
      to: email.contact.email,
      replyTo: email.fromEmail,
      subject: email.subject,
      text: fullBody,
      html: htmlBody,
      headers,
    });

    // Extract clean message ID (remove angle brackets if present)
    const messageId = info.messageId?.replace(/[<>]/g, '') || null;

    // Update email status, store SES message ID, and link to identity
    await prisma.emailDraft.update({
      where: { id: emailDraftId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        sesMessageId: messageId,
        sesIdentityId: identity.id,
      },
    });

    // Increment identity sent count
    await incrementIdentitySentCount(identity.id);

    // Record event
    await prisma.emailEvent.create({
      data: {
        emailDraftId,
        eventType: 'SENT',
        providerMessageId: messageId,
        eventPayload: { response: info.response },
      },
    });

    // Publish real-time event for connected clients
    try {
      await publishEmailEvent(
        emailDraftId,
        'SENT',
        email.contact.email,
        email.business.canonicalName
      );
    } catch (e) {
      console.error('Error publishing SENT event:', e);
    }

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

/**
 * Send a notification/system email (not tracked as marketing email)
 */
export async function sendNotificationEmail(params: {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const fromEmail = process.env.NOTIFICATION_FROM_EMAIL || 'noreply@callsphere.tech';
    const fromName = process.env.NOTIFICATION_FROM_NAME || 'CallSphere';

    const htmlBody = params.bodyHtml || generateNotificationHtml(params.bodyText, params.subject);

    await transporter.sendMail({
      from: `${fromName} <${fromEmail}>`,
      to: params.to,
      subject: params.subject,
      text: params.bodyText,
      html: htmlBody,
    });

    return { success: true };
  } catch (error) {
    console.error('Error sending notification email:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Generate HTML for notification emails
 */
function generateNotificationHtml(bodyText: string, title: string): string {
  const bodyHtml = bodyText
    .split('\n\n')
    .map(paragraph => `<p style="margin: 0 0 16px 0; line-height: 1.6;">${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; color: #333333; background-color: #f5f5f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
          <!-- Header -->
          <tr>
            <td style="padding: 30px 40px 20px 40px; border-bottom: 1px solid #eeeeee;">
              <h1 style="margin: 0; font-size: 24px; color: #4f46e5;">CallSphere</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 30px 40px;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #fafafa; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; font-size: 12px; color: #999999; text-align: center;">
                This is an automated message from CallSphere. Please do not reply to this email.
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
  // Clean the message ID (remove angle brackets if present)
  const cleanMessageId = providerMessageId?.replace(/[<>]/g, '');

  // Find the email draft by sesMessageId first (most reliable)
  let emailDraft;

  if (cleanMessageId) {
    // First try to find by sesMessageId on EmailDraft
    emailDraft = await prisma.emailDraft.findUnique({
      where: { sesMessageId: cleanMessageId },
    });

    // If not found, try by providerMessageId in events
    if (!emailDraft) {
      const event = await prisma.emailEvent.findFirst({
        where: { providerMessageId: cleanMessageId },
        include: { emailDraft: true },
      });
      emailDraft = event?.emailDraft;
    }
  }

  if (!emailDraft) {
    // Try to find by contact email as last resort
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

  console.log(`[SES Webhook] Event: ${type}, Email: ${email}, MessageId: ${cleanMessageId}, Found: ${!!emailDraft}`);

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

    // Publish real-time event for connected clients
    try {
      // Get business name for display
      const emailWithBusiness = await prisma.emailDraft.findUnique({
        where: { id: emailDraft.id },
        include: { business: { select: { canonicalName: true } } },
      });
      await publishEmailEvent(
        emailDraft.id,
        eventTypeMap[type],
        email,
        emailWithBusiness?.business?.canonicalName
      );
    } catch (e) {
      console.error('Error publishing email event:', e);
    }
  }

  // Add to suppression list for bounces and complaints only
  // Note: 'reject' means virus detected - not the recipient's fault
  if (type === 'bounce') {
    await suppressEmail(email, 'BOUNCE');
  } else if (type === 'complaint') {
    await suppressEmail(email, 'COMPLAINT');
  }
}
