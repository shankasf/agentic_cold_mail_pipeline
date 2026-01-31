import { createApiHandler, jsonResponse, Errors } from '@/lib/api-utils';
import prisma from '@/lib/prisma';

// GET /api/template-uploads/[id] - Get upload details with rows
export const GET = createApiHandler(
  async (request, { logger, params }) => {
    const { id } = params;
    const { searchParams } = new URL(request.url);
    const includeRows = searchParams.get('rows') !== 'false';
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    logger.debug('Fetching template upload', { id, includeRows, limit, offset });

    const upload = await prisma.templateUpload.findUnique({
      where: { id },
      include: {
        template: true,
        rows: includeRows ? {
          orderBy: { rowIndex: 'asc' },
          take: limit,
          skip: offset,
        } : false,
        _count: {
          select: { rows: true },
        },
      },
    });

    if (!upload) {
      throw Errors.notFound('Upload');
    }

    // Get row status counts
    const statusCounts = await prisma.templateRow.groupBy({
      by: ['status'],
      where: { uploadId: id },
      _count: true,
    });

    const stats = {
      total: upload._count.rows,
      pending: 0,
      processed: 0,
      skipped: 0,
      error: 0,
    };

    for (const count of statusCounts) {
      const statusKey = count.status.toLowerCase();
      if (statusKey === 'pending') stats.pending = count._count;
      else if (statusKey === 'processed') stats.processed = count._count;
      else if (statusKey === 'skipped') stats.skipped = count._count;
      else if (statusKey === 'error') stats.error = count._count;
    }

    logger.info('Template upload fetched', { id, rowCount: stats.total });
    return jsonResponse({
      ...upload,
      stats,
    });
  },
  { requireAuth: true }
);

// DELETE /api/template-uploads/[id] - Delete upload and associated rows
export const DELETE = createApiHandler(
  async (request, { logger, params }) => {
    const { id } = params;

    logger.debug('Deleting template upload', { id });

    const upload = await prisma.templateUpload.findUnique({
      where: { id },
    });

    if (!upload) {
      throw Errors.notFound('Upload');
    }

    // Delete upload (cascades to rows)
    await prisma.templateUpload.delete({
      where: { id },
    });

    logger.info('Template upload deleted', { id });
    return jsonResponse({ message: 'Upload deleted' });
  },
  { requireAuth: true }
);
