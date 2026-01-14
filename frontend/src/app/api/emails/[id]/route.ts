import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import aiClient from '@/lib/ai-client';
import { EmailStatus } from '@prisma/client';

// GET /api/emails/[id] - Get email draft details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const email = await prisma.emailDraft.findUnique({
      where: { id },
      include: {
        business: {
          include: {
            evidence: {
              include: {
                chunk: true,
              },
            },
          },
        },
        contact: true,
        events: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!email) {
      return NextResponse.json(
        { error: 'Email not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(email);
  } catch (error) {
    console.error('Error fetching email:', error);
    return NextResponse.json(
      { error: 'Failed to fetch email' },
      { status: 500 }
    );
  }
}

// PATCH /api/emails/[id] - Update email draft
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Input validation
    if (body.subject !== undefined) {
      if (typeof body.subject !== 'string') {
        return NextResponse.json({ error: 'Subject must be a string' }, { status: 400 });
      }
      if (body.subject.length === 0) {
        return NextResponse.json({ error: 'Subject cannot be empty' }, { status: 400 });
      }
      if (body.subject.length > 200) {
        return NextResponse.json({ error: 'Subject must be 200 characters or less' }, { status: 400 });
      }
    }

    if (body.bodyText !== undefined) {
      if (typeof body.bodyText !== 'string') {
        return NextResponse.json({ error: 'Body text must be a string' }, { status: 400 });
      }
      if (body.bodyText.length === 0) {
        return NextResponse.json({ error: 'Body text cannot be empty' }, { status: 400 });
      }
      if (body.bodyText.length > 10000) {
        return NextResponse.json({ error: 'Body text must be 10000 characters or less' }, { status: 400 });
      }
    }

    const validStatuses = ['DRAFT', 'NEEDS_REVIEW', 'APPROVED', 'EXPORTED', 'SENT', 'REPLIED', 'BOUNCED', 'COMPLAINT'];
    if (body.status !== undefined) {
      const normalizedStatus = String(body.status).toUpperCase();
      if (!validStatuses.includes(normalizedStatus)) {
        return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
      }
    }

    const email = await prisma.emailDraft.findUnique({
      where: { id },
    });

    if (!email) {
      return NextResponse.json(
        { error: 'Email not found' },
        { status: 404 }
      );
    }

    // Build update data object
    const updateData: {
      subject?: string;
      bodyText?: string;
      deliverabilityScore?: number;
      spamFlags?: string[];
      footerText?: string;
      status?: EmailStatus;
    } = {};

    if (body.subject !== undefined || body.bodyText !== undefined) {
      const subject = body.subject ?? email.subject;
      const bodyText = body.bodyText ?? email.bodyText;

      // Recheck compliance
      const compliance = await aiClient.recheckCompliance(subject, bodyText);

      updateData.subject = subject;
      updateData.bodyText = bodyText;
      updateData.deliverabilityScore = compliance.deliverabilityScore;
      updateData.spamFlags = compliance.spamFlags;
      updateData.footerText = compliance.footerText;
    }

    if (body.status !== undefined) {
      updateData.status = String(body.status).toUpperCase() as EmailStatus;
    }

    const updated = await prisma.emailDraft.update({
      where: { id },
      data: updateData,
      include: {
        business: true,
        contact: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating email:', error);
    return NextResponse.json(
      { error: 'Failed to update email' },
      { status: 500 }
    );
  }
}

// DELETE /api/emails/[id] - Delete email draft
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.emailDraft.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Email deleted' });
  } catch (error) {
    console.error('Error deleting email:', error);
    return NextResponse.json(
      { error: 'Failed to delete email' },
      { status: 500 }
    );
  }
}
