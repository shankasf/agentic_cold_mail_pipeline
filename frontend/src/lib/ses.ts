import {
  SESv2Client,
  CreateEmailIdentityCommand,
  DeleteEmailIdentityCommand,
  GetEmailIdentityCommand,
  CreateConfigurationSetCommand,
  CreateConfigurationSetEventDestinationCommand,
  DeleteConfigurationSetCommand,
  SendEmailCommand,
  SendEmailCommandInput,
} from '@aws-sdk/client-sesv2';

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

// Configuration
const SNS_TOPIC_ARN = process.env.SES_EVENT_SNS_TOPIC_ARN || '';

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

    // Add event destination to publish to SNS
    if (SNS_TOPIC_ARN) {
      const eventDestinationCommand = new CreateConfigurationSetEventDestinationCommand({
        ConfigurationSetName: configSetName,
        EventDestinationName: `${configSetName}-events`,
        EventDestination: {
          Enabled: true,
          MatchingEventTypes: [
            'SEND',
            'DELIVERY',
            'OPEN',
            'CLICK',
            'BOUNCE',
            'COMPLAINT',
            'REJECT',
            'DELIVERY_DELAY',
          ],
          SnsDestination: {
            TopicArn: SNS_TOPIC_ARN,
          },
        },
      });

      await client.send(eventDestinationCommand);
    }

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
 * Send an email via SES
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
  } catch (error: any) {
    console.error('Error sending email:', error);
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
