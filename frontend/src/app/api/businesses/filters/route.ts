import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/businesses/filters - Get distinct values for filter dropdowns
export async function GET() {
  try {
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

    return NextResponse.json({
      industries: industries
        .map((b) => b.industryGuess)
        .filter((v): v is string => v !== null && v.trim() !== ''),
      locations: locations
        .map((b) => b.location)
        .filter((v): v is string => v !== null && v.trim() !== ''),
    });
  } catch (error) {
    console.error('Error fetching filter options:', error);
    return NextResponse.json(
      { error: 'Failed to fetch filter options' },
      { status: 500 }
    );
  }
}
