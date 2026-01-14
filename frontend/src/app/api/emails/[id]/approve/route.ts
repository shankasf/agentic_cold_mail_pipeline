import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// POST /api/emails/[id]/approve - Approve an email for sending
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const email = await prisma.emailDraft.findUnique({
      where: { id },
    });

    if (!email) {
      return NextResponse.json(
        { error: 'Email not found' },
        { status: 404 }
      );
    }

    // Get admin settings for thresholds
    const settings = await prisma.adminSettings.findFirst();
    const deliverabilityThreshold = settings?.deliverabilityThreshold ?? 70;

    // Check if email meets deliverability threshold
    if (email.deliverabilityScore < deliverabilityThreshold) {
      return NextResponse.json(
        {
          error: `Deliverability score (${email.deliverabilityScore}) is below threshold (${deliverabilityThreshold})`,
        },
        { status: 400 }
      );
    }

    // Check if email is in a state that can be approved
    if (!['DRAFT', 'NEEDS_REVIEW'].includes(email.status)) {
      return NextResponse.json(
        { error: `Cannot approve email with status: ${email.status}` },
        { status: 400 }
      );
    }

    // Update to approved
    const updated = await prisma.emailDraft.update({
      where: { id },
      data: { status: 'APPROVED' },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error approving email:', error);
    return NextResponse.json(
      { error: 'Failed to approve email' },
      { status: 500 }
    );
  }
}
