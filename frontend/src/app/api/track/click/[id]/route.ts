import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { publishEmailEvent } from '@/lib/redis';

export const dynamic = 'force-dynamic';

// GET /api/track/click/[id]?url=... - Track click and redirect
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const emailDraftId = params.id;
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return new NextResponse('Missing URL parameter', { status: 400 });
  }

  try {
    // Decode the URL
    const targetUrl = decodeURIComponent(url);

    // Find the email to verify it exists
    const email = await prisma.emailDraft.findUnique({
      where: { id: emailDraftId },
      include: {
        contact: true,
        business: true,
      },
    });

    if (email) {
      // Check if we already recorded a click for this email (to avoid duplicates)
      const existingClick = await prisma.emailEvent.findFirst({
        where: {
          emailDraftId,
          eventType: 'CLICK',
          eventPayload: {
            path: ['link'],
            equals: targetUrl,
          },
        },
      });

      if (!existingClick) {
        // Record the click event
        await prisma.emailEvent.create({
          data: {
            emailDraftId,
            eventType: 'CLICK',
            eventPayload: {
              link: targetUrl,
              timestamp: new Date().toISOString(),
              userAgent: request.headers.get('user-agent') || undefined,
              ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
            },
          },
        });

        // Publish real-time event
        try {
          await publishEmailEvent(
            emailDraftId,
            'CLICK',
            email.contact.email,
            email.business.canonicalName
          );
        } catch {
          // Ignore publish errors
        }
      }
    }

    // Redirect to the target URL
    return NextResponse.redirect(targetUrl, { status: 302 });
  } catch (error) {
    console.error('Error tracking click:', error);
    // If anything fails, still try to redirect
    const targetUrl = decodeURIComponent(url);
    return NextResponse.redirect(targetUrl, { status: 302 });
  }
}
