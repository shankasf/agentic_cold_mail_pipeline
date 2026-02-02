const https = require('https');

/**
 * Lambda function triggered by S3 when new inbound emails arrive.
 * Forwards the S3 event to the application webhook for processing.
 *
 * Environment Variables:
 * - WEBHOOK_HOST: The hostname of the webhook endpoint (e.g., marketing.callsphere.tech)
 * - LAMBDA_SECRET: Secret key for authenticating with the webhook
 */
exports.handler = async (event) => {
  console.log('S3 Event:', JSON.stringify(event, null, 2));

  const results = [];

  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    console.log(`Processing: s3://${bucket}/${key}`);

    const payload = JSON.stringify({
      bucket,
      key,
      eventTime: record.eventTime,
    });

    const options = {
      hostname: process.env.WEBHOOK_HOST,
      port: 443,
      path: '/api/webhooks/ses-inbound',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'X-Lambda-Secret': process.env.LAMBDA_SECRET,
      },
    };

    try {
      const response = await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            console.log(`Response: ${res.statusCode}`, data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ statusCode: res.statusCode, body: data });
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          });
        });

        req.on('error', (error) => {
          console.error('Request error:', error);
          reject(error);
        });

        req.write(payload);
        req.end();
      });

      results.push({
        bucket,
        key,
        success: true,
        response: response.body,
      });
    } catch (error) {
      console.error(`Failed to process ${key}:`, error.message);
      results.push({
        bucket,
        key,
        success: false,
        error: error.message,
      });
      // Re-throw to trigger Lambda retry
      throw error;
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Processed',
      results,
    }),
  };
};
