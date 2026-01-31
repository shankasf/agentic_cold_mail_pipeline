import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { publishEmailEvent } from '@/lib/redis';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  Errors,
} from '@/lib/api-utils';

interface TrackEventRequest {
  eventType: string;
}

const VALID_EVENTS = ['DELIVERED', 'OPEN', 'CLICK', 'REPLY'] as const;

// POST /api/emails/[id]/track - Manually record a tracking event (for testing)
export const POST = createApiHandler(
  async (request: NextRequest, { logger, params }) => {
    const { id } = params;
    const body = await parseJsonBody<TrackEventRequest>(request, logger);
    const { eventType } = body;

    // Validate event type
    if (!VALID_EVENTS.includes(eventType as typeof VALID_EVENTS[number])) {
      throw Errors.badRequest(
        `Invalid event type. Must be one of: ${VALID_EVENTS.join(', ')}`,
        'eventType'
      );
    }

    logger.debug('Recording tracking event', { emailId: id, eventType });

    // Find the email
    const email = await prisma.emailDraft.findUnique({
      where: { id },
      include: {
        contact: true,
        business: true,
      },
    });

    if (!email) {
      throw Errors.notFound('Email');
    }

    // Create the event
    await prisma.emailEvent.create({
      data: {
        emailDraftId: id,
        eventType: eventType as typeof VALID_EVENTS[number],
        eventPayload: { manual: true, timestamp: new Date().toISOString() },
      },
    });

    // Publish real-time update
    await publishEmailEvent(
      id,
      eventType,
      email.contact.email,
      email.business.canonicalName
    );

    logger.info('Tracking event recorded and published', {
      emailId: id,
      eventType,
      contactEmail: email.contact.email,
    });

    return jsonResponse({
      success: true,
      message: `${eventType} event recorded and published`,
      emailId: id,
    });
  },
  { requireAuth: true }
);
