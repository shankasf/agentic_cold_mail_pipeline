import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import storage from '@/lib/storage';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';

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
export async function GET() {
  try {
    const uploads = await prisma.templateFileUpload.findMany({
      orderBy: { uploadedAt: 'desc' },
      include: {
        createdTemplate: {
          select: { id: true, name: true, category: true },
        },
      },
    });

    return NextResponse.json(uploads);
  } catch (error) {
    console.error('Error fetching template uploads:', error);
    return NextResponse.json(
      { error: 'Failed to fetch template uploads' },
      { status: 500 }
    );
  }
}

// POST /api/template-uploads - Upload a template file (txt, pdf, docx)
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Check file extension
    const fileType = file.name.split('.').pop()?.toLowerCase() || '';
    if (!SUPPORTED_EXTENSIONS.includes(fileType)) {
      return NextResponse.json(
        { error: `Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}` },
        { status: 400 }
      );
    }

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

    return NextResponse.json(upload, { status: 201 });
  } catch (error) {
    console.error('Error uploading template file:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
