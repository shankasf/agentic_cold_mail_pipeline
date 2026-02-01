import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { getUserFilter } from '@/lib/auth-utils';
import {
  createApiHandler,
  jsonResponse,
  Errors,
} from '@/lib/api-utils';

// Supported file types
const SUPPORTED_EXTENSIONS = ['csv', 'xlsx', 'xls', 'json', 'tsv', 'txt'];

// AI Service URL for column mapping
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

// Parse file based on extension (same as import route)
function parseFile(buffer: Buffer, filename: string): { rows: Record<string, string>[]; headers: string[] } {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
    const delimiter = ext === 'tsv' ? '\t' : (ext === 'txt' ? '\t' : ',');
    const text = buffer.toString('utf-8');
    const result = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      delimiter: ext === 'csv' ? undefined : delimiter,
    });

    return {
      rows: result.data as Record<string, string>[],
      headers: result.meta.fields || [],
    };
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error('Excel file has no sheets');
    }
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
    const headers = data.length > 0 ? Object.keys(data[0]) : [];

    return { rows: data, headers };
  }

  if (ext === 'json') {
    const text = buffer.toString('utf-8');
    let data = JSON.parse(text);

    if (!Array.isArray(data)) {
      if (data.data && Array.isArray(data.data)) {
        data = data.data;
      } else if (data.rows && Array.isArray(data.rows)) {
        data = data.rows;
      } else {
        throw new Error('JSON must be an array of objects');
      }
    }

    const headers = data.length > 0 ? Object.keys(data[0]) : [];
    return { rows: data, headers };
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

// Collect sample values for each column (first 3 non-empty values)
function collectSampleValues(rows: Record<string, string>[], columnName: string): string[] {
  const samples: string[] = [];
  for (const row of rows) {
    const value = row[columnName];
    if (value && String(value).trim() && samples.length < 3) {
      samples.push(String(value).trim().substring(0, 100));
    }
    if (samples.length >= 3) break;
  }
  return samples;
}

// Standard fields we try to map to
const STANDARD_FIELDS = [
  { key: 'email', label: 'Email', required: true },
  { key: 'business_name', label: 'Business Name', required: true },
  { key: 'website', label: 'Website', required: false },
  { key: 'industry', label: 'Industry', required: false },
  { key: 'location', label: 'Location', required: false },
  { key: 'contact_name', label: 'Contact Name', required: false },
  { key: 'role', label: 'Role/Title', required: false },
  { key: 'phone', label: 'Phone', required: false },
  { key: 'linkedin_url', label: 'LinkedIn', required: false },
];

interface ColumnMapping {
  sourceColumn: string;
  targetField: string | null;
  confidence: number;
  sampleValues: string[];
  isCustom: boolean;
}

// POST /api/campaigns/[id]/import/preview - Preview file and get column mappings
export const POST = createApiHandler(
  async (request: NextRequest, { logger, params }) => {
    const campaignId = params.id;
    const userFilter = await getUserFilter();

    logger.debug('Previewing import file', { campaignId });

    // Check campaign exists and user has access
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        ...userFilter,
      },
    });

    if (!campaign) {
      throw Errors.notFound('Campaign');
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      throw Errors.badRequest('No file provided');
    }

    const filename = file.name;
    const fileType = file.name.split('.').pop()?.toLowerCase() || 'unknown';

    if (!SUPPORTED_EXTENSIONS.includes(fileType)) {
      throw Errors.badRequest(`Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`);
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let rows: Record<string, string>[];
    let headers: string[];
    try {
      const parsed = parseFile(buffer, filename);
      rows = parsed.rows;
      headers = parsed.headers;
    } catch (parseError) {
      throw Errors.badRequest(parseError instanceof Error ? parseError.message : 'Failed to parse file');
    }

    // Get AI column mappings (with 5s timeout)
    let aiMappings: Record<string, string> = {};
    let aiConfidence: Record<string, number> = {};

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minutes

      const response = await fetch(`${AI_SERVICE_URL}/map-columns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headers,
          sampleRows: rows.slice(0, 5),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const aiResult = await response.json();
        aiMappings = aiResult.mappingDict || {};

        // Extract confidence from mappings array
        if (aiResult.mappings) {
          for (const m of aiResult.mappings) {
            aiConfidence[m.sourceColumn.toLowerCase()] = m.confidence;
          }
        }
      }
    } catch (err) {
      logger.debug('AI column mapping failed, using fallback', { error: err });
    }

    // Build column mapping response
    const columnMappings: ColumnMapping[] = headers.map((header) => {
      const normalizedHeader = header.toLowerCase();
      const mappedTo = aiMappings[header] || aiMappings[normalizedHeader] || null;
      const confidence = aiConfidence[normalizedHeader] || (mappedTo ? 70 : 0);

      // Check if mapped to a standard field
      const isStandardField = STANDARD_FIELDS.some((f) => f.key === mappedTo);

      return {
        sourceColumn: header,
        targetField: mappedTo,
        confidence,
        sampleValues: collectSampleValues(rows, header),
        isCustom: !isStandardField && mappedTo !== null,
      };
    });

    // Identify unmapped columns (these will be stored as customData)
    const unmappedColumns = columnMappings
      .filter((m) => !m.targetField)
      .map((m) => m.sourceColumn);

    // Check for required fields
    const mappedFields = new Set(columnMappings.map((m) => m.targetField).filter(Boolean));
    const missingRequired = STANDARD_FIELDS
      .filter((f) => f.required && !mappedFields.has(f.key))
      .map((f) => f.label);

    logger.info('Import preview generated', {
      totalColumns: headers.length,
      mappedColumns: headers.length - unmappedColumns.length,
      unmappedColumns: unmappedColumns.length,
      rowCount: rows.length,
    });

    return jsonResponse({
      filename,
      fileType,
      rowCount: rows.length,
      columnCount: headers.length,
      columnMappings,
      unmappedColumns,
      missingRequired,
      standardFields: STANDARD_FIELDS,
      previewRows: rows.slice(0, 5), // First 5 rows for preview
      message: unmappedColumns.length > 0
        ? `${unmappedColumns.length} column(s) will be stored as custom data for AI to use`
        : 'All columns mapped successfully',
    });
  },
  { requireAuth: true }
);
