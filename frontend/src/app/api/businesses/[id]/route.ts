import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/businesses/[id] - Get business details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const business = await prisma.business.findUnique({
      where: { id },
      include: {
        contacts: true,
        evidence: {
          include: {
            chunk: true,
            upload: {
              select: {
                id: true,
                filename: true,
              },
            },
          },
        },
        emailDrafts: {
          include: {
            contact: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        observations: {
          include: {
            chunk: true,
          },
        },
      },
    });

    if (!business) {
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(business);
  } catch (error) {
    console.error('Error fetching business:', error);
    return NextResponse.json(
      { error: 'Failed to fetch business' },
      { status: 500 }
    );
  }
}

// PATCH /api/businesses/[id] - Update business
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updated = await prisma.business.update({
      where: { id },
      data: {
        canonicalName: body.canonicalName,
        website: body.website,
        industryGuess: body.industryGuess,
        location: body.location,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating business:', error);
    return NextResponse.json(
      { error: 'Failed to update business' },
      { status: 500 }
    );
  }
}

// DELETE /api/businesses/[id] - Delete business
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.business.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Business deleted' });
  } catch (error) {
    console.error('Error deleting business:', error);
    return NextResponse.json(
      { error: 'Failed to delete business' },
      { status: 500 }
    );
  }
}
