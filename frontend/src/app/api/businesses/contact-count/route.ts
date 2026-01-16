import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// POST /api/businesses/contact-count - Get contact count for selected businesses
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessIds } = body;

    if (!businessIds || !Array.isArray(businessIds) || businessIds.length === 0) {
      return NextResponse.json(
        { error: 'Business IDs are required' },
        { status: 400 }
      );
    }

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

    return NextResponse.json({
      businessCount: businessIds.length,
      contactCount: activeContacts.length,
      suppressedCount: contacts.length - activeContacts.length,
    });
  } catch (error) {
    console.error('Error counting contacts:', error);
    return NextResponse.json(
      { error: 'Failed to count contacts' },
      { status: 500 }
    );
  }
}
