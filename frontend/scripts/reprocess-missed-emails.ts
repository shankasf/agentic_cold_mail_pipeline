import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as https from 'https';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const CONFIG = {
  s3Bucket: 'callsphere-inbound-emails',
  s3Prefix: 'inbound/',
  webhookHost: 'marketing.callsphere.tech',
  webhookPath: '/api/webhooks/ses-inbound',
  lambdaSecret: process.env.LAMBDA_INBOUND_SECRET!,
};

async function callWebhook(bucket: string, key: string, eventTime: string): Promise<{ success: boolean; error?: string }> {
  const payload = JSON.stringify({ bucket, key, eventTime });

  return new Promise((resolve) => {
    const options = {
      hostname: CONFIG.webhookHost,
      port: 443,
      path: CONFIG.webhookPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'X-Lambda-Secret': CONFIG.lambdaSecret,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode! >= 200 && res.statusCode! < 300) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: `HTTP ${res.statusCode}: ${data}` });
        }
      });
    });

    req.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });

    req.write(payload);
    req.end();
  });
}

async function reprocessMissedEmails() {
  const s3 = new S3Client({ region: 'us-east-1' });

  // Get S3 objects from last 2 days
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

  const s3Result = await s3.send(
    new ListObjectsV2Command({
      Bucket: CONFIG.s3Bucket,
      Prefix: CONFIG.s3Prefix,
      MaxKeys: 1000,
    })
  );

  const s3Objects = (s3Result.Contents || []).filter(
    (o) =>
      new Date(o.LastModified!) > twoDaysAgo &&
      o.Key !== 'inbound/AMAZON_SES_SETUP_NOTIFICATION'
  );

  console.log(`Found ${s3Objects.length} emails in S3 from last 2 days`);
  console.log('Reprocessing all...\n');

  let successCount = 0;
  let failCount = 0;

  for (const obj of s3Objects) {
    const key = obj.Key!;
    const eventTime = obj.LastModified!.toISOString();

    process.stdout.write(`Processing ${key}... `);

    const result = await callWebhook(CONFIG.s3Bucket, key, eventTime);

    if (result.success) {
      console.log('✓');
      successCount++;
    } else {
      console.log(`✗ ${result.error}`);
      failCount++;
    }

    // Small delay to avoid overwhelming the server
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\nDone! Success: ${successCount}, Failed: ${failCount}`);
}

reprocessMissedEmails();
