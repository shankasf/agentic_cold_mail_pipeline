import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { addEmailSendJob } from '@/lib/queue';
import { startOfDay } from 'date-fns';

// POST /api/emails/send - Queue approved emails for sending
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { emailIds } = body;

    // Get admin settings for cap
    const settings = await prisma.adminSettings.findFirst();
    const dailyCap = settings?.sendingCapPerDay ?? 100;

    // Check today's sent count
    const todayStart = startOfDay(new Date());
    const sentToday = await prisma.emailDraft.count({
      where: {
        status: 'SENT',
        updatedAt: { gte: todayStart },
      },
    });

    const remaining = dailyCap - sentToday;

    if (remaining <= 0) {
      return NextResponse.json(
        { error: 'Daily sending cap reached' },
        { status: 400 }
      );
    }

    // Get approved emails not in suppression list
    let where: any = { status: 'APPROVED' };

    if (emailIds && emailIds.length > 0) {
      where.id = { in: emailIds };
    }

    const emails = await prisma.emailDraft.findMany({
      where,
      include: { contact: true },
      take: remaining,
    });

    // Filter out suppressed emails
    const suppressedEmails = await prisma.suppressionList.findMany({
      where: {
        email: { in: emails.map((e) => e.contact.email) },
      },
    });
    const suppressedSet = new Set(suppressedEmails.map((s) => s.email));

    const eligibleEmails = emails.filter((e) => !suppressedSet.has(e.contact.email));

    // Queue for sending
    let queued = 0;
    for (const email of eligibleEmails) {
      await addEmailSendJob({ emailDraftId: email.id });
      queued++;
    }

    return NextResponse.json({
      message: `Queued ${queued} emails for sending`,
      queued,
      skippedSuppressed: emails.length - eligibleEmails.length,
    });
  } catch (error) {
    console.error('Error queuing emails:', error);
    return NextResponse.json(
      { error: 'Failed to queue emails' },
      { status: 500 }
    );
  }
}
