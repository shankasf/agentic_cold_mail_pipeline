import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// POST /api/emails/reply - Create and optionally send a reply to an email thread
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId, contactId, subject, bodyText, sendImmediately = false } = body;

    if (!businessId || !contactId) {
      return NextResponse.json(
        { error: 'Business ID and Contact ID are required' },
        { status: 400 }
      );
    }

    if (!subject || !bodyText) {
      return NextResponse.json(
        { error: 'Subject and body are required' },
        { status: 400 }
      );
    }

    // Get business and contact
    const [business, contact] = await Promise.all([
      prisma.business.findUnique({ where: { id: businessId } }),
      prisma.contact.findUnique({ where: { id: contactId } }),
    ]);

    if (!business || !contact) {
      return NextResponse.json(
        { error: 'Business or contact not found' },
        { status: 404 }
      );
    }

    // Find existing thread for this business/contact combo
    const existingThread = await prisma.emailDraft.findFirst({
      where: {
        businessId,
        contactId,
        threadId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });

    const threadId = existingThread?.threadId || undefined;
    const parentEmailId = existingThread?.id || undefined;

    // Get admin settings for sender info
    const settings = await prisma.adminSettings.findFirst();

    // Create the reply email
    const email = await prisma.emailDraft.create({
      data: {
        businessId,
        contactId,
        fromName: settings?.businessAddress ? 'CallSphere' : 'CallSphere',
        fromEmail: 'sagar@callsphere.tech',
        subject,
        bodyText,
        footerText: '',
        personalizationTokens: {
          manual_reply: true,
        },
        confidenceScore: 100, // Manual replies are confident
        deliverabilityScore: 100,
        status: sendImmediately ? 'APPROVED' : 'DRAFT',
        pipelineType: 'TEMPLATE',
        parentEmailId,
        threadId,
      },
      include: {
        business: true,
        contact: true,
      },
    });

    // If sending immediately, send the email
    if (sendImmediately) {
      const { sendEmail } = await import('@/lib/email-sender');

      try {
        const result = await sendEmail(email.id);

        if (result.success) {
          // Update sentAt timestamp
          await prisma.emailDraft.update({
            where: { id: email.id },
            data: { sentAt: new Date() },
          });

          return NextResponse.json({
            success: true,
            sent: true,
            email: { ...email, status: 'SENT' },
            message: 'Reply sent successfully',
          });
        } else {
          return NextResponse.json({
            success: true,
            sent: false,
            email,
            message: result.error || 'Reply created but failed to send. It has been saved as a draft.',
          });
        }
      } catch (sendError) {
        console.error('Error sending reply:', sendError);
        return NextResponse.json({
          success: true,
          sent: false,
          email,
          message: 'Reply created but failed to send. It has been saved as a draft.',
        });
      }
    }

    return NextResponse.json({
      success: true,
      sent: false,
      email,
      message: 'Reply created as draft',
    });
  } catch (error) {
    console.error('Error creating reply:', error);
    return NextResponse.json(
      { error: 'Failed to create reply' },
      { status: 500 }
    );
  }
}
