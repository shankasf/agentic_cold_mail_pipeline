import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// POST /api/emails/delete - Delete emails by IDs
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { emailIds } = body;

    if (!emailIds || !Array.isArray(emailIds) || emailIds.length === 0) {
      return NextResponse.json(
        { error: 'Email IDs are required' },
        { status: 400 }
      );
    }

    // Delete email events first (due to foreign key constraint)
    await prisma.emailEvent.deleteMany({
      where: { emailDraftId: { in: emailIds } },
    });

    // Delete the emails
    const result = await prisma.emailDraft.deleteMany({
      where: { id: { in: emailIds } },
    });

    return NextResponse.json({
      success: true,
      deleted: result.count,
      message: `Deleted ${result.count} email(s)`,
    });
  } catch (error) {
    console.error('Error deleting emails:', error);
    return NextResponse.json(
      { error: 'Failed to delete emails' },
      { status: 500 }
    );
  }
}
