import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/email-logs/[id] - Get logs for a specific email
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const email = await prisma.emailDraft.findUnique({
      where: { id },
      include: {
        contact: true,
        business: true,
        events: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!email) {
      return NextResponse.json(
        { error: 'Email not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ email });
  } catch (error) {
    console.error('Error fetching email logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch email logs' },
      { status: 500 }
    );
  }
}
