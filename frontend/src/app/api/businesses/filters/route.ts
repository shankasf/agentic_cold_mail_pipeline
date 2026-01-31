import prisma from '@/lib/prisma';
import { createApiHandler, jsonResponse } from '@/lib/api-utils';

// GET /api/businesses/filters - Get distinct values for filter dropdowns
export const GET = createApiHandler(
  async (_request, { logger }) => {
    logger.debug('Fetching filter options');

    const [industries, locations] = await Promise.all([
      prisma.business.findMany({
        where: {
          industryGuess: { not: null },
        },
        select: { industryGuess: true },
        distinct: ['industryGuess'],
        orderBy: { industryGuess: 'asc' },
      }),
      prisma.business.findMany({
        where: {
          location: { not: null },
        },
        select: { location: true },
        distinct: ['location'],
        orderBy: { location: 'asc' },
      }),
    ]);

    const result = {
      industries: industries
        .map((b) => b.industryGuess)
        .filter((v): v is string => v !== null && v.trim() !== ''),
      locations: locations
        .map((b) => b.location)
        .filter((v): v is string => v !== null && v.trim() !== ''),
    };

    logger.info('Filter options fetched', {
      industriesCount: result.industries.length,
      locationsCount: result.locations.length,
    });

    return jsonResponse(result);
  },
  { requireAuth: true }
);
