import {
  IAMClient,
  CreateRoleCommand,
  PutRolePolicyCommand,
  GetRoleCommand,
} from '@aws-sdk/client-iam';
import {
  LambdaClient,
  CreateFunctionCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  AddPermissionCommand,
  GetFunctionCommand,
  RemovePermissionCommand,
} from '@aws-sdk/client-lambda';
import {
  S3Client,
  PutBucketNotificationConfigurationCommand,
  GetBucketNotificationConfigurationCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
} from '@aws-sdk/client-s3';
import {
  SESClient,
  CreateReceiptRuleSetCommand,
  CreateReceiptRuleCommand,
  DescribeActiveReceiptRuleSetCommand,
  SetActiveReceiptRuleSetCommand,
  DescribeReceiptRuleCommand,
  DeleteReceiptRuleCommand,
} from '@aws-sdk/client-ses';
import {
  SNSClient,
  ListSubscriptionsCommand,
  UnsubscribeCommand,
} from '@aws-sdk/client-sns';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const CONFIG = {
  region: process.env.AWS_REGION || 'us-east-1',
  accountId: process.env.AWS_ACCOUNT_ID || '689517798275',
  s3Bucket: 'callsphere-inbound-emails',
  s3Prefix: 'inbound/',
  lambdaFunctionName: 'ses-inbound-email-trigger',
  iamRoleName: 'lambda-ses-inbound-role',
  webhookHost: 'marketing.callsphere.tech',
  receiptRuleSetName: 'callsphere-inbound-rules',
  receiptRuleName: 'store-inbound-emails',
  recipientDomain: 'callsphere.tech',
};

// Initialize AWS clients
const iamClient = new IAMClient({ region: CONFIG.region });
const lambdaClient = new LambdaClient({ region: CONFIG.region });
const s3Client = new S3Client({ region: CONFIG.region });
const sesClient = new SESClient({ region: CONFIG.region });
const snsClient = new SNSClient({ region: CONFIG.region });

/**
 * Step 0: Create S3 Bucket for inbound emails
 */
async function createS3Bucket(): Promise<void> {
  console.log('\n=== Step 0: Creating S3 Bucket ===');

  // Check if bucket exists
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: CONFIG.s3Bucket }));
    console.log(`  Bucket "${CONFIG.s3Bucket}" already exists`);
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      console.log(`  Creating bucket "${CONFIG.s3Bucket}"...`);
      await s3Client.send(
        new CreateBucketCommand({
          Bucket: CONFIG.s3Bucket,
          // Note: us-east-1 doesn't require LocationConstraint
        })
      );
      console.log('  Bucket created successfully');
    } else {
      throw error;
    }
  }

  // Add bucket policy to allow SES to write emails
  const bucketPolicy = {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'AllowSESPuts',
        Effect: 'Allow',
        Principal: {
          Service: 'ses.amazonaws.com',
        },
        Action: 's3:PutObject',
        Resource: `arn:aws:s3:::${CONFIG.s3Bucket}/*`,
        Condition: {
          StringEquals: {
            'AWS:SourceAccount': CONFIG.accountId,
          },
        },
      },
    ],
  };

  console.log('  Setting bucket policy for SES...');
  await s3Client.send(
    new PutBucketPolicyCommand({
      Bucket: CONFIG.s3Bucket,
      Policy: JSON.stringify(bucketPolicy),
    })
  );
  console.log('  Bucket policy set');
}

/**
 * Step 1: Create IAM Role for Lambda
 */
async function createIamRole(): Promise<string> {
  console.log('\n=== Step 1: Creating IAM Role ===');

  const trustPolicy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: {
          Service: 'lambda.amazonaws.com',
        },
        Action: 'sts:AssumeRole',
      },
    ],
  };

  const inlinePolicy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        Resource: 'arn:aws:logs:*:*:*',
      },
      {
        Effect: 'Allow',
        Action: ['s3:GetObject'],
        Resource: `arn:aws:s3:::${CONFIG.s3Bucket}/*`,
      },
    ],
  };

  const roleArn = `arn:aws:iam::${CONFIG.accountId}:role/${CONFIG.iamRoleName}`;

  try {
    // Check if role exists
    await iamClient.send(new GetRoleCommand({ RoleName: CONFIG.iamRoleName }));
    console.log(`  Role "${CONFIG.iamRoleName}" already exists`);
  } catch (error: any) {
    if (error.name === 'NoSuchEntityException') {
      // Create role
      console.log(`  Creating role "${CONFIG.iamRoleName}"...`);
      await iamClient.send(
        new CreateRoleCommand({
          RoleName: CONFIG.iamRoleName,
          AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
          Description: 'IAM role for SES inbound email Lambda trigger',
        })
      );
      console.log('  Role created successfully');

      // Wait for role to propagate
      console.log('  Waiting for role to propagate...');
      await sleep(10000);
    } else {
      throw error;
    }
  }

  // Add/update inline policy
  console.log('  Attaching inline policy...');
  await iamClient.send(
    new PutRolePolicyCommand({
      RoleName: CONFIG.iamRoleName,
      PolicyName: 'lambda-ses-inbound-policy',
      PolicyDocument: JSON.stringify(inlinePolicy),
    })
  );
  console.log('  Inline policy attached');

  return roleArn;
}

/**
 * Step 2: Create/Update Lambda Function
 */
async function createLambdaFunction(roleArn: string): Promise<string> {
  console.log('\n=== Step 2: Creating Lambda Function ===');

  // Read Lambda code
  const lambdaCodePath = path.join(__dirname, '../../lambda/ses-inbound-trigger/index.js');
  if (!fs.existsSync(lambdaCodePath)) {
    throw new Error(`Lambda code not found at: ${lambdaCodePath}`);
  }
  const lambdaCode = fs.readFileSync(lambdaCodePath, 'utf-8');

  // Create zip buffer
  const zipBuffer = await createZipBuffer(lambdaCode);

  const lambdaArn = `arn:aws:lambda:${CONFIG.region}:${CONFIG.accountId}:function:${CONFIG.lambdaFunctionName}`;

  const lambdaSecret = process.env.LAMBDA_INBOUND_SECRET;
  if (!lambdaSecret) {
    throw new Error('LAMBDA_INBOUND_SECRET not found in environment variables');
  }

  try {
    // Check if function exists
    await lambdaClient.send(
      new GetFunctionCommand({ FunctionName: CONFIG.lambdaFunctionName })
    );
    console.log(`  Function "${CONFIG.lambdaFunctionName}" exists, updating...`);

    // Update function code
    await lambdaClient.send(
      new UpdateFunctionCodeCommand({
        FunctionName: CONFIG.lambdaFunctionName,
        ZipFile: zipBuffer,
      })
    );
    console.log('  Function code updated');

    // Wait for update to complete
    await sleep(5000);

    // Update function configuration
    await lambdaClient.send(
      new UpdateFunctionConfigurationCommand({
        FunctionName: CONFIG.lambdaFunctionName,
        Environment: {
          Variables: {
            WEBHOOK_HOST: CONFIG.webhookHost,
            LAMBDA_SECRET: lambdaSecret,
          },
        },
        Timeout: 30,
        MemorySize: 128,
      })
    );
    console.log('  Function configuration updated');
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      console.log(`  Creating function "${CONFIG.lambdaFunctionName}"...`);

      await lambdaClient.send(
        new CreateFunctionCommand({
          FunctionName: CONFIG.lambdaFunctionName,
          Runtime: 'nodejs20.x',
          Role: roleArn,
          Handler: 'index.handler',
          Code: {
            ZipFile: zipBuffer,
          },
          Description: 'Triggers webhook when inbound emails arrive in S3',
          Timeout: 30,
          MemorySize: 128,
          Environment: {
            Variables: {
              WEBHOOK_HOST: CONFIG.webhookHost,
              LAMBDA_SECRET: lambdaSecret,
            },
          },
        })
      );
      console.log('  Function created successfully');

      // Wait for function to be active
      console.log('  Waiting for function to be active...');
      await sleep(5000);
    } else {
      throw error;
    }
  }

  return lambdaArn;
}

/**
 * Step 3: Add S3 Trigger to Lambda
 */
async function addS3Trigger(lambdaArn: string): Promise<void> {
  console.log('\n=== Step 3: Adding S3 Trigger ===');

  const statementId = 's3-trigger-permission';

  // Add Lambda permission for S3
  try {
    // Try to remove existing permission first
    try {
      await lambdaClient.send(
        new RemovePermissionCommand({
          FunctionName: CONFIG.lambdaFunctionName,
          StatementId: statementId,
        })
      );
      console.log('  Removed existing S3 permission');
    } catch (e: any) {
      // Ignore if permission doesn't exist
    }

    await lambdaClient.send(
      new AddPermissionCommand({
        FunctionName: CONFIG.lambdaFunctionName,
        StatementId: statementId,
        Action: 'lambda:InvokeFunction',
        Principal: 's3.amazonaws.com',
        SourceArn: `arn:aws:s3:::${CONFIG.s3Bucket}`,
        SourceAccount: CONFIG.accountId,
      })
    );
    console.log('  Added Lambda permission for S3');
  } catch (error: any) {
    if (error.name === 'ResourceConflictException') {
      console.log('  Lambda permission for S3 already exists');
    } else {
      throw error;
    }
  }

  // Get current notification configuration
  let existingConfig: any = {};
  try {
    const response = await s3Client.send(
      new GetBucketNotificationConfigurationCommand({ Bucket: CONFIG.s3Bucket })
    );
    existingConfig = response;
    console.log('  Retrieved existing S3 notification config');
  } catch (error) {
    console.log('  No existing notification config found');
  }

  // Filter out any existing Lambda notification for our function
  const existingLambdaConfigs = (existingConfig.LambdaFunctionConfigurations || []).filter(
    (config: any) => !config.LambdaFunctionArn?.includes(CONFIG.lambdaFunctionName)
  );

  // Add S3 notification configuration
  const notificationConfig = {
    LambdaFunctionConfigurations: [
      ...existingLambdaConfigs,
      {
        LambdaFunctionArn: lambdaArn,
        Events: ['s3:ObjectCreated:*'],
        Filter: {
          Key: {
            FilterRules: [
              {
                Name: 'prefix',
                Value: CONFIG.s3Prefix,
              },
            ],
          },
        },
      },
    ],
    // Preserve other notification types
    TopicConfigurations: existingConfig.TopicConfigurations || [],
    QueueConfigurations: existingConfig.QueueConfigurations || [],
  };

  await s3Client.send(
    new PutBucketNotificationConfigurationCommand({
      Bucket: CONFIG.s3Bucket,
      NotificationConfiguration: notificationConfig,
    })
  );
  console.log(`  S3 notification configured for prefix "${CONFIG.s3Prefix}"`);
}

/**
 * Step 4: Setup SES Receipt Rule
 */
async function setupSesReceiptRule(): Promise<void> {
  console.log('\n=== Step 4: Setting up SES Receipt Rule ===');

  // Create rule set if it doesn't exist
  try {
    await sesClient.send(
      new CreateReceiptRuleSetCommand({
        RuleSetName: CONFIG.receiptRuleSetName,
      })
    );
    console.log(`  Created rule set "${CONFIG.receiptRuleSetName}"`);
  } catch (error: any) {
    if (error.name === 'AlreadyExistsException') {
      console.log(`  Rule set "${CONFIG.receiptRuleSetName}" already exists`);
    } else {
      throw error;
    }
  }

  // Check if rule exists and delete it to recreate
  try {
    await sesClient.send(
      new DescribeReceiptRuleCommand({
        RuleSetName: CONFIG.receiptRuleSetName,
        RuleName: CONFIG.receiptRuleName,
      })
    );
    console.log(`  Rule "${CONFIG.receiptRuleName}" exists, deleting to recreate...`);
    await sesClient.send(
      new DeleteReceiptRuleCommand({
        RuleSetName: CONFIG.receiptRuleSetName,
        RuleName: CONFIG.receiptRuleName,
      })
    );
    console.log('  Deleted existing rule');
  } catch (error: any) {
    if (error.name !== 'RuleDoesNotExistException') {
      // Ignore if rule doesn't exist
      if (!error.message?.includes('does not exist')) {
        console.log(`  Note: ${error.message}`);
      }
    }
  }

  // Create receipt rule
  try {
    await sesClient.send(
      new CreateReceiptRuleCommand({
        RuleSetName: CONFIG.receiptRuleSetName,
        Rule: {
          Name: CONFIG.receiptRuleName,
          Enabled: true,
          Recipients: [CONFIG.recipientDomain],
          Actions: [
            {
              S3Action: {
                BucketName: CONFIG.s3Bucket,
                ObjectKeyPrefix: CONFIG.s3Prefix,
              },
            },
          ],
          ScanEnabled: true,
        },
      })
    );
    console.log(`  Created receipt rule "${CONFIG.receiptRuleName}"`);
  } catch (error: any) {
    if (error.name === 'AlreadyExistsException') {
      console.log(`  Receipt rule "${CONFIG.receiptRuleName}" already exists`);
    } else {
      throw error;
    }
  }

  // Activate the rule set
  try {
    await sesClient.send(
      new SetActiveReceiptRuleSetCommand({
        RuleSetName: CONFIG.receiptRuleSetName,
      })
    );
    console.log(`  Activated rule set "${CONFIG.receiptRuleSetName}"`);
  } catch (error: any) {
    console.log(`  Note: ${error.message}`);
  }

  // Verify active rule set
  try {
    const activeRuleSet = await sesClient.send(
      new DescribeActiveReceiptRuleSetCommand({})
    );
    console.log(
      `  Active rule set: ${activeRuleSet.Metadata?.Name || 'none'}`
    );
  } catch (error) {
    console.log('  Could not verify active rule set');
  }
}

/**
 * Step 5: Cleanup old SNS subscriptions
 */
async function cleanupSns(): Promise<void> {
  console.log('\n=== Step 5: Cleaning up old SNS subscriptions ===');

  let nextToken: string | undefined;
  let cleanedCount = 0;

  do {
    const response = await snsClient.send(
      new ListSubscriptionsCommand({
        NextToken: nextToken,
      })
    );

    for (const subscription of response.Subscriptions || []) {
      const endpoint = subscription.Endpoint || '';
      const subscriptionArn = subscription.SubscriptionArn || '';

      // Check if this is an old webhook endpoint we should clean up
      if (
        (endpoint.includes('ses-inbound') || endpoint.includes('webhooks/ses')) &&
        subscriptionArn !== 'PendingConfirmation' &&
        subscriptionArn !== 'Deleted'
      ) {
        console.log(`  Unsubscribing: ${endpoint}`);
        try {
          await snsClient.send(
            new UnsubscribeCommand({
              SubscriptionArn: subscriptionArn,
            })
          );
          cleanedCount++;
        } catch (error: any) {
          console.log(`    Failed to unsubscribe: ${error.message}`);
        }
      }
    }

    nextToken = response.NextToken;
  } while (nextToken);

  if (cleanedCount === 0) {
    console.log('  No old SNS subscriptions found to clean up');
  } else {
    console.log(`  Cleaned up ${cleanedCount} old subscription(s)`);
  }
}

/**
 * Helper: Create ZIP buffer from code
 */
async function createZipBuffer(code: string): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const archiver = require('archiver');
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    archive.append(code, { name: 'index.js' });
    archive.finalize();
  });
}

/**
 * Helper: Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log('========================================');
  console.log('AWS Inbound Email Setup');
  console.log('========================================');
  console.log('\nConfiguration:');
  console.log(`  Region: ${CONFIG.region}`);
  console.log(`  Account ID: ${CONFIG.accountId}`);
  console.log(`  S3 Bucket: ${CONFIG.s3Bucket}`);
  console.log(`  S3 Prefix: ${CONFIG.s3Prefix}`);
  console.log(`  Lambda Function: ${CONFIG.lambdaFunctionName}`);
  console.log(`  IAM Role: ${CONFIG.iamRoleName}`);
  console.log(`  Webhook Host: ${CONFIG.webhookHost}`);
  console.log(`  Receipt Rule Set: ${CONFIG.receiptRuleSetName}`);
  console.log(`  Recipient Domain: ${CONFIG.recipientDomain}`);

  try {
    // Step 0: Create S3 Bucket (if needed)
    await createS3Bucket();

    // Step 1: Create IAM Role
    const roleArn = await createIamRole();

    // Step 2: Create Lambda Function
    const lambdaArn = await createLambdaFunction(roleArn);

    // Step 3: Add S3 Trigger
    await addS3Trigger(lambdaArn);

    // Step 4: Setup SES Receipt Rule
    await setupSesReceiptRule();

    // Step 5: Cleanup SNS
    await cleanupSns();

    console.log('\n========================================');
    console.log('Setup Complete!');
    console.log('========================================');
    console.log('\nVerification steps:');
    console.log(`  1. Lambda: https://${CONFIG.region}.console.aws.amazon.com/lambda/home?region=${CONFIG.region}#/functions/${CONFIG.lambdaFunctionName}`);
    console.log(`  2. IAM Role: https://console.aws.amazon.com/iam/home#/roles/${CONFIG.iamRoleName}`);
    console.log(`  3. S3 Notifications: https://s3.console.aws.amazon.com/s3/buckets/${CONFIG.s3Bucket}?tab=properties`);
    console.log(`  4. SES Rules: https://${CONFIG.region}.console.aws.amazon.com/ses/home?region=${CONFIG.region}#/email-receiving`);
    console.log(`\nTest by sending an email to test@${CONFIG.recipientDomain}`);
  } catch (error: any) {
    console.error('\n========================================');
    console.error('Setup Failed!');
    console.error('========================================');
    console.error(`\nError: ${error.message}`);

    if (error.name === 'AccessDeniedException' || error.name === 'UnauthorizedAccess') {
      console.error('\nRequired IAM permissions:');
      console.error('  - iam:CreateRole, iam:GetRole, iam:PutRolePolicy');
      console.error('  - lambda:CreateFunction, lambda:GetFunction, lambda:UpdateFunctionCode');
      console.error('  - lambda:UpdateFunctionConfiguration, lambda:AddPermission, lambda:RemovePermission');
      console.error('  - s3:GetBucketNotificationConfiguration, s3:PutBucketNotificationConfiguration');
      console.error('  - ses:CreateReceiptRuleSet, ses:CreateReceiptRule, ses:SetActiveReceiptRuleSet');
      console.error('  - ses:DescribeActiveReceiptRuleSet, ses:DescribeReceiptRule, ses:DeleteReceiptRule');
      console.error('  - sns:ListSubscriptions, sns:Unsubscribe');
    }

    process.exit(1);
  }
}

// Run main function
main();
