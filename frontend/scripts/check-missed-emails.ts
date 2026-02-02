import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function checkMissedEmails() {
  const s3 = new S3Client({ region: 'us-east-1' });
  const prisma = new PrismaClient();

  // Get S3 objects from last 2 days
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

  const s3Result = await s3.send(
    new ListObjectsV2Command({
      Bucket: 'callsphere-inbound-emails',
      Prefix: 'inbound/',
      MaxKeys: 1000,
    })
  );

  const s3Objects = (s3Result.Contents || []).filter(
    (o) =>
      new Date(o.LastModified!) > twoDaysAgo &&
      o.Key !== 'inbound/AMAZON_SES_SETUP_NOTIFICATION'
  );
  console.log('Emails in S3 (last 2 days):', s3Objects.length);

  // Get processed emails from DB
  const processed = await prisma.inboundEmail.findMany({
    select: { s3ObjectKey: true },
  });
  const processedKeys = new Set(processed.map((e) => e.s3ObjectKey));
  console.log('Processed in DB:', processedKeys.size);

  // Find missed
  const missed = s3Objects.filter((o) => !processedKeys.has(o.Key!));
  console.log('Missed emails:', missed.length);

  if (missed.length > 0) {
    console.log('\nMissed email keys:');
    missed.forEach((o) =>
      console.log('  ', new Date(o.LastModified!).toISOString(), o.Key)
    );
  }

  await prisma.$disconnect();

  return missed.map(o => o.Key!);
}

checkMissedEmails();
