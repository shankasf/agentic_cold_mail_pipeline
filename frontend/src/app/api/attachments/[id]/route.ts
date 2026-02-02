import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler, jsonResponse, Errors } from '@/lib/api-utils';
import prisma from '@/lib/prisma';
import { storage } from '@/lib/storage';

// GET /api/attachments/[id] - Download attachment by ID
export const GET = createApiHandler(
  async (
    request: NextRequest,
    { logger, user, params }
  ) => {
    const id = params?.id as string;

    if (!id) {
      throw Errors.badRequest('Attachment ID is required');
    }

    logger.debug('Fetching attachment', { attachmentId: id });

    // Find the attachment with its inbound email
    const attachment = await prisma.emailAttachment.findUnique({
      where: { id },
      include: {
        inboundEmail: {
          select: {
            id: true,
            sesIdentityId: true,
            sesIdentity: {
              select: {
                id: true,
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!attachment) {
      throw Errors.notFound('Attachment');
    }

    // Permission check: user must own the SES identity (unless admin)
    if (user.role !== 'ADMIN') {
      const sesIdentity = attachment.inboundEmail.sesIdentity;
      if (!sesIdentity || sesIdentity.userId !== user.id) {
        throw Errors.forbidden('You do not have permission to access this attachment');
      }
    }

    logger.debug('Attachment found', {
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.sizeBytes,
      storagePath: attachment.storagePath,
    });

    // Read the file from storage
    try {
      const fileBuffer = await storage.read(attachment.storagePath);

      // Set proper headers for file download
      const headers = new Headers();
      headers.set('Content-Type', attachment.contentType);
      headers.set('Content-Length', attachment.sizeBytes.toString());

      // For inline content (like images in email), use inline disposition
      // Otherwise, use attachment disposition to trigger download
      if (attachment.isInline) {
        headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.filename)}"`);
      } else {
        headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.filename)}"`);
      }

      // Cache for 1 hour (attachments don't change)
      headers.set('Cache-Control', 'private, max-age=3600');

      logger.info('Attachment downloaded', {
        attachmentId: id,
        filename: attachment.filename,
        size: attachment.sizeBytes,
      });

      return new NextResponse(new Uint8Array(fileBuffer), {
        status: 200,
        headers,
      });
    } catch (error: any) {
      logger.error('Failed to read attachment from storage', error, {
        attachmentId: id,
        storagePath: attachment.storagePath,
      });
      throw Errors.internal('Failed to retrieve attachment');
    }
  },
  { requireAuth: true }
);

// HEAD /api/attachments/[id] - Get attachment metadata without downloading
export const HEAD = createApiHandler(
  async (
    request: NextRequest,
    { logger, user, params }
  ) => {
    const id = params?.id as string;

    if (!id) {
      throw Errors.badRequest('Attachment ID is required');
    }

    // Find the attachment with its inbound email
    const attachment = await prisma.emailAttachment.findUnique({
      where: { id },
      include: {
        inboundEmail: {
          select: {
            sesIdentityId: true,
            sesIdentity: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!attachment) {
      throw Errors.notFound('Attachment');
    }

    // Permission check
    if (user.role !== 'ADMIN') {
      const sesIdentity = attachment.inboundEmail.sesIdentity;
      if (!sesIdentity || sesIdentity.userId !== user.id) {
        throw Errors.forbidden('You do not have permission to access this attachment');
      }
    }

    const headers = new Headers();
    headers.set('Content-Type', attachment.contentType);
    headers.set('Content-Length', attachment.sizeBytes.toString());
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.filename)}"`);

    return new NextResponse(null, {
      status: 200,
      headers,
    });
  },
  { requireAuth: true }
);
