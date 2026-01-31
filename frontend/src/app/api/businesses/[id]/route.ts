import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { createApiHandler, jsonResponse, parseJsonBody, Errors } from '@/lib/api-utils';

// GET /api/businesses/[id] - Get business details
export const GET = createApiHandler(
  async (request: NextRequest, { logger, params }) => {
    const { id } = params;

    logger.debug('Fetching business', { businessId: id });

    const business = await prisma.business.findUnique({
      where: { id },
      include: {
        contacts: {
          take: 50,
          orderBy: { createdAt: 'desc' },
        },
        evidence: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: {
            chunk: {
              select: {
                id: true,
                textContent: true,
              },
            },
            upload: {
              select: {
                id: true,
                filename: true,
              },
            },
          },
        },
        emailDrafts: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            subject: true,
            status: true,
            createdAt: true,
            contact: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        },
        observations: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            industry: true,
            observation: true,
            confidence: true,
          },
        },
        _count: {
          select: {
            contacts: true,
            evidence: true,
            emailDrafts: true,
            observations: true,
          },
        },
      },
    });

    if (!business) {
      throw Errors.notFound('Business');
    }

    logger.info('Business fetched', { businessId: id });

    return jsonResponse(business);
  },
  { requireAuth: true }
);

// PATCH /api/businesses/[id] - Update business
export const PATCH = createApiHandler(
  async (request: NextRequest, { logger, params }) => {
    const { id } = params;
    const body = await parseJsonBody<{
      canonicalName?: string;
      website?: string;
      industryGuess?: string;
      location?: string;
    }>(request, logger);

    logger.debug('Updating business', { businessId: id });

    const updated = await prisma.business.update({
      where: { id },
      data: {
        canonicalName: body.canonicalName,
        website: body.website,
        industryGuess: body.industryGuess,
        location: body.location,
      },
    });

    logger.info('Business updated', { businessId: id });

    return jsonResponse(updated);
  },
  { requireAuth: true }
);

// DELETE /api/businesses/[id] - Delete business
export const DELETE = createApiHandler(
  async (request: NextRequest, { logger, params }) => {
    const { id } = params;

    logger.debug('Deleting business', { businessId: id });

    await prisma.business.delete({
      where: { id },
    });

    logger.info('Business deleted', { businessId: id });

    return jsonResponse({ message: 'Business deleted' });
  },
  { requireAuth: true }
);
