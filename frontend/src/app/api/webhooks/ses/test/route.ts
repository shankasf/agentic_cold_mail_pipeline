import { NextRequest } from 'next/server';
import { createApiHandler, jsonResponse } from '@/lib/api-utils';

// GET /api/webhooks/ses/test - Test if webhook endpoint is reachable
export const GET = createApiHandler(
  async (_request: NextRequest, { logger, requestId }) => {
    logger.debug('SES webhook test endpoint hit');

    return jsonResponse(
      {
        status: 'ok',
        message: 'SES webhook endpoint is reachable',
        timestamp: new Date().toISOString(),
      },
      { requestId }
    );
  }
);

// POST /api/webhooks/ses/test - Simulate a tracking event for testing
export const POST = createApiHandler(
  async (request: NextRequest, { logger, requestId }) => {
    const body = await request.json();

    logger.info('SES webhook test received', {
      bodyKeys: Object.keys(body),
      bodyPreview: JSON.stringify(body).substring(0, 500),
    });

    return jsonResponse(
      {
        status: 'received',
        message: 'Test webhook received successfully',
        body,
        timestamp: new Date().toISOString(),
      },
      { requestId }
    );
  }
);
