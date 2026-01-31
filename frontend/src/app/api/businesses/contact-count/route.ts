import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  Errors,
} from '@/lib/api-utils';

interface ContactCountRequest {
  businessIds: string[];
}

// POST /api/businesses/contact-count - Get contact count for selected businesses
export const POST = createApiHandler(
  async (request: NextRequest, { logger }) => {
    const body = await parseJsonBody<ContactCountRequest>(request, logger);
    const { businessIds } = body;

    if (!businessIds || !Array.isArray(businessIds) || businessIds.length === 0) {
      throw Errors.badRequest('Business IDs are required', 'businessIds');
    }

    logger.debug('Counting contacts for businesses', { businessCount: businessIds.length });

    // Get suppression list
    const suppressedEmails = await prisma.suppressionList.findMany({
      select: { email: true },
    });
    const suppressedSet = new Set(suppressedEmails.map(s => s.email.toLowerCase()));

    // Get contacts for selected businesses
    const contacts = await prisma.contact.findMany({
      where: {
        businessId: { in: businessIds },
      },
      select: {
        email: true,
      },
    });

    // Count non-suppressed contacts
    const activeContacts = contacts.filter(
      c => !suppressedSet.has(c.email.toLowerCase())
    );

    logger.info('Contact count completed', {
      businessCount: businessIds.length,
      contactCount: activeContacts.length,
      suppressedCount: contacts.length - activeContacts.length,
    });

    return jsonResponse({
      businessCount: businessIds.length,
      contactCount: activeContacts.length,
      suppressedCount: contacts.length - activeContacts.length,
    });
  },
  { requireAuth: true }
);
