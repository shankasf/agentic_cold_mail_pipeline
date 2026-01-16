import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// POST /api/emails/follow-up - Create follow-up emails for selected emails
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { emailIds, subject, bodyText } = body;

    if (!emailIds || !Array.isArray(emailIds) || emailIds.length === 0) {
      return NextResponse.json(
        { error: 'Email IDs are required' },
        { status: 400 }
      );
    }

    if (!subject || !bodyText) {
      return NextResponse.json(
        { error: 'Subject and body are required' },
        { status: 400 }
      );
    }

    // Get the original emails
    const originalEmails = await prisma.emailDraft.findMany({
      where: { id: { in: emailIds } },
      include: {
        contact: true,
        business: true,
      },
    });

    if (originalEmails.length === 0) {
      return NextResponse.json(
        { error: 'No emails found' },
        { status: 404 }
      );
    }

    // Create follow-up emails
    const followUpEmails = await Promise.all(
      originalEmails.map(async (email) => {
        // Determine thread ID - use existing or create new from original email
        const threadId = email.threadId || email.id;

        return prisma.emailDraft.create({
          data: {
            businessId: email.businessId,
            contactId: email.contactId,
            fromName: email.fromName,
            fromEmail: email.fromEmail,
            subject: subject.includes('Re:') ? subject : `Re: ${email.subject}`,
            bodyText,
            footerText: email.footerText,
            personalizationTokens: {
              follow_up: true,
              original_email_id: email.id,
            },
            confidenceScore: 80,
            deliverabilityScore: 80,
            status: 'APPROVED', // Auto-approve follow-ups
            pipelineType: 'TEMPLATE',
            parentEmailId: email.id,
            threadId,
          },
        });
      })
    );

    // Update original emails with thread ID if not set
    await Promise.all(
      originalEmails
        .filter((email) => !email.threadId)
        .map((email) =>
          prisma.emailDraft.update({
            where: { id: email.id },
            data: { threadId: email.id },
          })
        )
    );

    return NextResponse.json({
      success: true,
      created: followUpEmails.length,
      message: `Created ${followUpEmails.length} follow-up email(s)`,
      emails: followUpEmails.map((e) => e.id),
    });
  } catch (error) {
    console.error('Error creating follow-up emails:', error);
    return NextResponse.json(
      { error: 'Failed to create follow-up emails' },
      { status: 500 }
    );
  }
}
