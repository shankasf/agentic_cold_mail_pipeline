import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/template-uploads/[id] - Get upload details with rows
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const includeRows = searchParams.get('rows') !== 'false';
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

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
      return NextResponse.json(
        { error: 'Upload not found' },
        { status: 404 }
      );
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

    return NextResponse.json({
      ...upload,
      stats,
    });
  } catch (error) {
    console.error('Error fetching upload:', error);
    return NextResponse.json(
      { error: 'Failed to fetch upload' },
      { status: 500 }
    );
  }
}

// DELETE /api/template-uploads/[id] - Delete upload and associated rows
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const upload = await prisma.templateUpload.findUnique({
      where: { id },
    });

    if (!upload) {
      return NextResponse.json(
        { error: 'Upload not found' },
        { status: 404 }
      );
    }

    // Delete upload (cascades to rows)
    await prisma.templateUpload.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Upload deleted' });
  } catch (error) {
    console.error('Error deleting upload:', error);
    return NextResponse.json(
      { error: 'Failed to delete upload' },
      { status: 500 }
    );
  }
}
