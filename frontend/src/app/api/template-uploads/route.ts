import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import storage from '@/lib/storage';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { createApiHandler, jsonResponse, Errors } from '@/lib/api-utils';

// Supported file types for template uploads
const SUPPORTED_EXTENSIONS = ['txt', 'pdf', 'docx'];

// Extract text content from file based on type
async function extractContent(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (ext === 'txt') {
    return buffer.toString('utf-8');
  }

  if (ext === 'pdf') {
    const data = await pdf(buffer);
    return data.text;
  }

  if (ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

// GET /api/template-uploads - List all template file uploads
export const GET = createApiHandler(
  async (request, { logger }) => {
    logger.debug('Fetching template uploads');

    const uploads = await prisma.templateFileUpload.findMany({
      orderBy: { uploadedAt: 'desc' },
      include: {
        createdTemplate: {
          select: { id: true, name: true, category: true },
        },
      },
    });

    logger.info('Template uploads fetched', { count: uploads.length });
    return jsonResponse(uploads);
  },
  { requireAuth: true }
);

// POST /api/template-uploads - Upload a template file (txt, pdf, docx)
export const POST = createApiHandler(
  async (request: NextRequest, { logger }) => {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      throw Errors.badRequest('No file provided');
    }

    // Check file extension
    const fileType = file.name.split('.').pop()?.toLowerCase() || '';
    if (!SUPPORTED_EXTENSIONS.includes(fileType)) {
      throw Errors.badRequest(`Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`);
    }

    logger.debug('Processing template file upload', { filename: file.name, fileType });

    // Read file content
    const buffer = Buffer.from(await file.arrayBuffer());

    // Extract text content
    let content: string;
    let status = 'PARSED';
    let errorText: string | null = null;

    try {
      content = await extractContent(buffer, file.name);
      content = content.trim();

      if (!content) {
        status = 'FAILED';
        errorText = 'File is empty or could not extract text content';
        content = '';
      }
    } catch (parseError) {
      status = 'FAILED';
      errorText = parseError instanceof Error ? parseError.message : 'Failed to parse file';
      content = '';
      logger.debug('Failed to parse file content', { error: errorText });
    }

    // Save file to storage
    const storagePath = await storage.save(buffer, file.name);

    // Create upload record
    const upload = await prisma.templateFileUpload.create({
      data: {
        filename: file.name,
        fileType,
        sizeBytes: buffer.length,
        storagePath,
        content,
        status,
        errorText,
      },
    });

    logger.info('Template file uploaded', { uploadId: upload.id, status });
    return jsonResponse(upload, { status: 201 });
  },
  { requireAuth: true }
);
