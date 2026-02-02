import {
  SESv2Client,
  CreateEmailIdentityCommand,
  DeleteEmailIdentityCommand,
  GetEmailIdentityCommand,
  CreateConfigurationSetCommand,
  DeleteConfigurationSetCommand,
  SendEmailCommand,
  SendEmailCommandInput,
} from '@aws-sdk/client-sesv2';
import { sesCircuitBreaker, CircuitBreakerError } from './circuit-breaker';
import { logger } from './logger';

// SES Client singleton
let sesClient: SESv2Client | null = null;

function getSESClient(): SESv2Client {
  if (!sesClient) {
    sesClient = new SESv2Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
  }
  return sesClient;
}

/**
 * Check if SES circuit breaker is healthy
 */
export function isSESHealthy(): boolean {
  return sesCircuitBreaker.getState() === 'CLOSED';
}

/**
 * Get SES circuit breaker status
 */
export function getSESCircuitStatus() {
  return sesCircuitBreaker.getStatus();
}

/**
 * Verify an email identity in SES
 */
export async function verifyEmailIdentity(emailAddress: string): Promise<{
  success: boolean;
  identityArn?: string;
  error?: string;
}> {
  try {
    const client = getSESClient();

    const command = new CreateEmailIdentityCommand({
      EmailIdentity: emailAddress,
    });

    const response = await client.send(command);

    // The ARN format is: arn:aws:ses:region:account-id:identity/email@example.com
    const region = process.env.AWS_REGION || 'us-east-1';
    const accountId = process.env.AWS_ACCOUNT_ID || '';
    const identityArn = `arn:aws:ses:${region}:${accountId}:identity/${emailAddress}`;

    return {
      success: true,
      identityArn,
    };
  } catch (error: any) {
    console.error('Error verifying email identity:', error);
    return {
      success: false,
      error: error.message || 'Failed to verify email identity',
    };
  }
}

/**
 * Verify a domain identity in SES
 * Returns DKIM tokens for DNS configuration
 */
export async function verifyDomainIdentity(domain: string): Promise<{
  success: boolean;
  identityArn?: string;
  dkimTokens?: string[];
  error?: string;
}> {
  try {
    const client = getSESClient();

    const command = new CreateEmailIdentityCommand({
      EmailIdentity: domain,
      // Enable DKIM signing
      DkimSigningAttributes: {
        NextSigningKeyLength: 'RSA_2048_BIT',
      },
    });

    const response = await client.send(command);

    // The ARN format is: arn:aws:ses:region:account-id:identity/domain.com
    const region = process.env.AWS_REGION || 'us-east-1';
    const accountId = process.env.AWS_ACCOUNT_ID || '';
    const identityArn = `arn:aws:ses:${region}:${accountId}:identity/${domain}`;

    // Extract DKIM tokens for DNS configuration
    const dkimTokens = response.DkimAttributes?.Tokens || [];

    return {
      success: true,
      identityArn,
      dkimTokens,
    };
  } catch (error: any) {
    // If identity already exists, that's fine for domains
    if (error.name === 'AlreadyExistsException') {
      const region = process.env.AWS_REGION || 'us-east-1';
      const accountId = process.env.AWS_ACCOUNT_ID || '';
      return {
        success: true,
        identityArn: `arn:aws:ses:${region}:${accountId}:identity/${domain}`,
      };
    }
    console.error('Error verifying domain identity:', error);
    return {
      success: false,
      error: error.message || 'Failed to verify domain identity',
    };
  }
}

/**
 * Check verification status of a domain identity
 */
export async function getDomainVerificationStatus(domain: string): Promise<{
  verified: boolean;
  status?: string;
  dkimStatus?: string;
  error?: string;
}> {
  try {
    const client = getSESClient();

    const command = new GetEmailIdentityCommand({
      EmailIdentity: domain,
    });

    const response = await client.send(command);

    return {
      verified: response.VerifiedForSendingStatus === true,
      status: response.VerificationStatus,
      dkimStatus: response.DkimAttributes?.Status,
    };
  } catch (error: any) {
    console.error('Error getting domain identity status:', error);
    return {
      verified: false,
      error: error.message || 'Failed to get domain identity status',
    };
  }
}

/**
 * Check verification status of an email identity
 */
export async function getIdentityVerificationStatus(emailAddress: string): Promise<{
  verified: boolean;
  status?: string;
  error?: string;
}> {
  try {
    const client = getSESClient();

    const command = new GetEmailIdentityCommand({
      EmailIdentity: emailAddress,
    });

    const response = await client.send(command);

    return {
      verified: response.VerifiedForSendingStatus === true,
      status: response.VerificationStatus,
    };
  } catch (error: any) {
    console.error('Error getting identity status:', error);
    return {
      verified: false,
      error: error.message || 'Failed to get identity status',
    };
  }
}

/**
 * Delete an email identity from SES
 */
export async function deleteEmailIdentity(emailAddress: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const client = getSESClient();

    const command = new DeleteEmailIdentityCommand({
      EmailIdentity: emailAddress,
    });

    await client.send(command);

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting email identity:', error);
    return {
      success: false,
      error: error.message || 'Failed to delete email identity',
    };
  }
}

/**
 * Create a configuration set for tracking events
 */
export async function createConfigurationSet(configSetName: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const client = getSESClient();

    // Create the configuration set
    const createCommand = new CreateConfigurationSetCommand({
      ConfigurationSetName: configSetName,
      TrackingOptions: {
        CustomRedirectDomain: process.env.EMAIL_TRACKING_DOMAIN,
      },
      ReputationOptions: {
        ReputationMetricsEnabled: true,
      },
      SendingOptions: {
        SendingEnabled: true,
      },
    });

    await client.send(createCommand);

    // Note: Event destinations are now configured via Kinesis Firehose in AWS Console
    // See /api/webhooks/ses-firehose for event processing

    return { success: true };
  } catch (error: any) {
    // Ignore if already exists
    if (error.name === 'AlreadyExistsException') {
      return { success: true };
    }
    console.error('Error creating configuration set:', error);
    return {
      success: false,
      error: error.message || 'Failed to create configuration set',
    };
  }
}

/**
 * Delete a configuration set
 */
export async function deleteConfigurationSet(configSetName: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const client = getSESClient();

    const command = new DeleteConfigurationSetCommand({
      ConfigurationSetName: configSetName,
    });

    await client.send(command);

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting configuration set:', error);
    return {
      success: false,
      error: error.message || 'Failed to delete configuration set',
    };
  }
}

/**
 * Send an email via SES with circuit breaker protection
 */
export async function sendEmail(params: {
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  configSetName?: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string;
}): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  try {
    // Use circuit breaker for SES calls
    return await sesCircuitBreaker.call(async () => {
      const client = getSESClient();

      const fromAddress = params.fromName
        ? `${params.fromName} <${params.from}>`
        : params.from;

      const input: SendEmailCommandInput = {
        FromEmailAddress: fromAddress,
        Destination: {
          ToAddresses: [params.to],
        },
        Content: {
          Simple: {
            Subject: {
              Data: params.subject,
              Charset: 'UTF-8',
            },
            Body: {
              Text: {
                Data: params.bodyText,
                Charset: 'UTF-8',
              },
              ...(params.bodyHtml && {
                Html: {
                  Data: params.bodyHtml,
                  Charset: 'UTF-8',
                },
              }),
            },
          },
        },
        ...(params.configSetName && {
          ConfigurationSetName: params.configSetName,
        }),
        ...(params.replyTo && {
          ReplyToAddresses: [params.replyTo],
        }),
      };

      // For threading, we need to use raw email
      // This simple version doesn't support In-Reply-To headers
      // For full threading support, use SendRawEmailCommand

      const command = new SendEmailCommand(input);
      const response = await client.send(command);

      return {
        success: true,
        messageId: response.MessageId,
      };
    });
  } catch (error: any) {
    // Check if it's a circuit breaker error
    if (error instanceof CircuitBreakerError) {
      logger.warn('SES circuit breaker is open', {
        timeUntilRetry: error.timeUntilRetry,
        to: params.to,
      });
      return {
        success: false,
        error: `SES service temporarily unavailable. Retry in ${Math.ceil(error.timeUntilRetry / 1000)}s`,
      };
    }

    logger.error('Error sending email via SES', error, { to: params.to });
    return {
      success: false,
      error: error.message || 'Failed to send email',
    };
  }
}

/**
 * Warmup schedule - gradual increase in daily sending limit
 */
export const WARMUP_SCHEDULE = [
  { day: 1, limit: 50 },
  { day: 2, limit: 75 },
  { day: 3, limit: 100 },
  { day: 4, limit: 150 },
  { day: 5, limit: 200 },
  { day: 6, limit: 300 },
  { day: 7, limit: 400 },
  { day: 14, limit: 600 },
  { day: 21, limit: 800 },
  { day: 28, limit: 1000 },
  { day: 35, limit: 1500 },
  { day: 42, limit: 2000 },
  { day: 49, limit: 3000 },
  { day: 56, limit: 5000 },
  { day: 63, limit: 10000 },
];

/**
 * Adaptive warmup thresholds
 */
export const ADAPTIVE_WARMUP_CONFIG = {
  // Slow down warmup if these thresholds are exceeded
  bounceRateSlowdown: 2,      // Bounce rate > 2%
  complaintRateSlowdown: 0.1, // Complaint rate > 0.1%

  // Pause warmup entirely if these are exceeded
  bounceRatePause: 5,         // Bounce rate > 5%
  complaintRatePause: 0.2,    // Complaint rate > 0.2%

  // Speed up warmup if engagement is excellent
  openRateSpeedup: 30,        // Open rate > 30%
  clickRateSpeedup: 5,        // Click rate > 5%

  // Modifiers
  slowdownMultiplier: 0.5,    // Cut limit in half when slowing down
  speedupMultiplier: 1.25,    // 25% boost when speeding up
};

/**
 * Get the daily limit based on warmup day
 */
export function getWarmupLimit(warmupDay: number): number {
  // Find the appropriate limit based on warmup day
  for (let i = WARMUP_SCHEDULE.length - 1; i >= 0; i--) {
    if (warmupDay >= WARMUP_SCHEDULE[i].day) {
      return WARMUP_SCHEDULE[i].limit;
    }
  }
  return WARMUP_SCHEDULE[0].limit;
}

/**
 * Calculate adaptive warmup limit based on identity performance
 */
export interface AdaptiveWarmupResult {
  baseLimit: number;
  adaptiveLimit: number;
  action: 'normal' | 'slowdown' | 'speedup' | 'pause';
  reason?: string;
  metrics: {
    bounceRate: number;
    complaintRate: number;
    openRate: number;
    totalSent: number;
  };
}

export async function calculateAdaptiveWarmupLimit(
  identityId: string,
  warmupDay: number
): Promise<AdaptiveWarmupResult> {
  // Import prisma dynamically to avoid circular dependency
  const { default: prisma } = await import('./prisma');

  const baseLimit = getWarmupLimit(warmupDay);
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days

  // Get performance metrics for this identity
  const [totalSent, bounced, complaints, opens] = await Promise.all([
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
    prisma.emailEvent.count({
      where: {
        emailDraft: {
          sesIdentityId: identityId,
          sentAt: { gte: since },
        },
        eventType: 'OPEN',
      },
    }),
  ]);

  // Calculate rates
  const bounceRate = totalSent > 0 ? (bounced / totalSent) * 100 : 0;
  const complaintRate = totalSent > 0 ? (complaints / totalSent) * 100 : 0;
  const openRate = totalSent > 0 ? (opens / totalSent) * 100 : 0;

  const metrics = { bounceRate, complaintRate, openRate, totalSent };

  // Not enough data yet - use base limit
  if (totalSent < 50) {
    return {
      baseLimit,
      adaptiveLimit: baseLimit,
      action: 'normal',
      reason: 'Insufficient data for adaptive adjustment',
      metrics,
    };
  }

  // Check for pause conditions (critical reputation issues)
  if (bounceRate >= ADAPTIVE_WARMUP_CONFIG.bounceRatePause) {
    logger.warn('Adaptive warmup: PAUSE due to high bounce rate', {
      identityId,
      bounceRate,
      threshold: ADAPTIVE_WARMUP_CONFIG.bounceRatePause,
    });
    return {
      baseLimit,
      adaptiveLimit: 0, // Pause sending
      action: 'pause',
      reason: `Bounce rate ${bounceRate.toFixed(2)}% exceeds pause threshold ${ADAPTIVE_WARMUP_CONFIG.bounceRatePause}%`,
      metrics,
    };
  }

  if (complaintRate >= ADAPTIVE_WARMUP_CONFIG.complaintRatePause) {
    logger.warn('Adaptive warmup: PAUSE due to high complaint rate', {
      identityId,
      complaintRate,
      threshold: ADAPTIVE_WARMUP_CONFIG.complaintRatePause,
    });
    return {
      baseLimit,
      adaptiveLimit: 0,
      action: 'pause',
      reason: `Complaint rate ${complaintRate.toFixed(3)}% exceeds pause threshold ${ADAPTIVE_WARMUP_CONFIG.complaintRatePause}%`,
      metrics,
    };
  }

  // Check for slowdown conditions
  if (bounceRate >= ADAPTIVE_WARMUP_CONFIG.bounceRateSlowdown ||
      complaintRate >= ADAPTIVE_WARMUP_CONFIG.complaintRateSlowdown) {
    const adaptiveLimit = Math.floor(baseLimit * ADAPTIVE_WARMUP_CONFIG.slowdownMultiplier);
    logger.info('Adaptive warmup: SLOWDOWN due to elevated rates', {
      identityId,
      bounceRate,
      complaintRate,
      baseLimit,
      adaptiveLimit,
    });
    return {
      baseLimit,
      adaptiveLimit,
      action: 'slowdown',
      reason: `Rates elevated (bounce: ${bounceRate.toFixed(2)}%, complaint: ${complaintRate.toFixed(3)}%)`,
      metrics,
    };
  }

  // Check for speedup conditions (excellent engagement)
  if (openRate >= ADAPTIVE_WARMUP_CONFIG.openRateSpeedup &&
      bounceRate < 1 && complaintRate < 0.05) {
    const adaptiveLimit = Math.floor(baseLimit * ADAPTIVE_WARMUP_CONFIG.speedupMultiplier);
    // Don't exceed next tier's limit
    const nextTierLimit = getWarmupLimit(warmupDay + 7);
    const cappedLimit = Math.min(adaptiveLimit, nextTierLimit);

    logger.info('Adaptive warmup: SPEEDUP due to excellent engagement', {
      identityId,
      openRate,
      baseLimit,
      adaptiveLimit: cappedLimit,
    });
    return {
      baseLimit,
      adaptiveLimit: cappedLimit,
      action: 'speedup',
      reason: `Excellent engagement (open rate: ${openRate.toFixed(1)}%)`,
      metrics,
    };
  }

  // Normal operation
  return {
    baseLimit,
    adaptiveLimit: baseLimit,
    action: 'normal',
    metrics,
  };
}

/**
 * Get warmup status for all identities
 */
export async function getWarmupStatus(): Promise<Array<{
  identityId: string;
  emailAddress: string;
  warmupDay: number;
  status: string;
  adaptive: AdaptiveWarmupResult;
}>> {
  const { default: prisma } = await import('./prisma');

  const identities = await prisma.sESIdentity.findMany({
    where: {
      warmupEnabled: true,
      status: { in: ['VERIFIED', 'WARMING', 'ACTIVE'] },
    },
  });

  const results = await Promise.all(
    identities.map(async (identity) => {
      const adaptive = await calculateAdaptiveWarmupLimit(identity.id, identity.warmupDay);
      return {
        identityId: identity.id,
        emailAddress: identity.emailAddress,
        warmupDay: identity.warmupDay,
        status: identity.status,
        adaptive,
      };
    })
  );

  return results;
}
