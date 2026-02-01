import { NextRequest } from 'next/server';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  createApiHandler,
  jsonResponse,
  Errors,
} from '@/lib/api-utils';

// Supported file types
const SUPPORTED_EXTENSIONS = ['csv', 'xlsx', 'xls', 'json', 'tsv', 'txt'];

// AI Service URL for column mapping
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

// Parse file based on extension
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

// Collect sample values for each column
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

// Fallback synonym matching (same as import route)
const COLUMN_SYNONYMS: Record<string, string[]> = {
  email: ['email', 'e-mail', 'email_address', 'emailaddress', 'mail', 'contact_email', 'contactemail', 'work_email', 'workemail', 'primary_email', 'primaryemail', 'business_email', 'businessemail'],
  business_name: [
    'name', 'business_name', 'businessname', 'business',
    'company', 'company_name', 'companyname',
    'organization', 'organization_name', 'organizationname', 'org', 'org_name', 'orgname',
    'firm', 'firm_name', 'firmname',
    'enterprise', 'enterprise_name', 'enterprisename',
    'entity', 'entity_name', 'entityname',
    'account', 'account_name', 'accountname',
    'client', 'client_name', 'clientname',
    'vendor', 'vendor_name', 'vendorname'
  ],
  website: ['website', 'url', 'web', 'site', 'web_url', 'weburl', 'homepage', 'home_page', 'domain', 'web_address', 'webaddress', 'link', 'company_website', 'companywebsite', 'company_domain', 'companydomain'],
  industry: ['industry', 'sector', 'business_type', 'businesstype', 'type', 'category', 'vertical', 'market', 'field', 'niche', 'segment'],
  location: ['location', 'address', 'city', 'region', 'country', 'state', 'place', 'area', 'territory', 'headquarters', 'hq', 'office_location', 'officelocation', 'company_city', 'companycity'],
  contact_name: [
    'contact_name', 'contactname', 'contact', 'person',
    'first_name', 'firstname', 'full_name', 'fullname',
    'contact_person', 'contactperson', 'representative', 'rep',
    'poc', 'point_of_contact', 'pointofcontact'
  ],
  first_name: ['first_name', 'firstname', 'first', 'fname', 'given_name', 'givenname'],
  last_name: ['last_name', 'lastname', 'last', 'lname', 'surname', 'family_name', 'familyname'],
  role: ['role', 'title', 'position', 'job_title', 'jobtitle', 'designation', 'job', 'job_role', 'jobrole', 'occupation', 'function', 'seniority'],
  phone: ['phone', 'telephone', 'mobile', 'cell', 'contact_phone', 'phone_number', 'phonenumber', 'mobile_number', 'mobilenumber', 'company_phone_number', 'companyphonenumber'],
  linkedin_url: ['linkedin', 'linkedin_url', 'linkedinurl', 'linkedin_profile', 'linkedinprofile', 'profile_url', 'profileurl', 'company_linkedin', 'companylinkedin'],
};

function normalizeColumnName(name: string): string {
  return name.toLowerCase().replace(/[\s_\-]/g, '');
}

// Try to match a column header to a standard field using synonyms
function matchColumnToField(header: string): string | null {
  const normalized = normalizeColumnName(header);

  for (const [field, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
    const normalizedSynonyms = synonyms.map(normalizeColumnName);
    if (normalizedSynonyms.includes(normalized)) {
      return field;
    }
  }
  return null;
}

interface ColumnMapping {
  sourceColumn: string;
  targetField: string | null;
  confidence: number;
  sampleValues: string[];
  isCustom: boolean;
}

// POST /api/campaigns/preview-import - Preview file column mappings (no campaign ID needed)
export const POST = createApiHandler(
  async (request: NextRequest, { logger }) => {
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

    // Get AI column mappings (with 30s timeout for large files)
    let aiMappings: Record<string, string> = {};
    let aiConfidence: Record<string, number> = {};
    let aiMappingUsed = false;

    try {
      const controller = new AbortController();
      // 10 minute timeout for large files with many columns
      const timeoutMs = 600000; // 10 minutes
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      logger.debug('Calling AI column mapper', {
        columnCount: headers.length,
        timeoutMs,
        aiServiceUrl: AI_SERVICE_URL
      });

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
        aiMappingUsed = Object.keys(aiMappings).length > 0;

        logger.debug('AI mapping result', {
          mappedColumns: Object.keys(aiMappings).length,
          unmappedColumns: aiResult.unmappedColumns?.length || 0
        });

        // Extract confidence from mappings array
        if (aiResult.mappings) {
          for (const m of aiResult.mappings) {
            aiConfidence[m.sourceColumn.toLowerCase()] = m.confidence;
          }
        }
      } else {
        const errorText = await response.text();
        logger.warn('AI column mapping returned error', { status: response.status, error: errorText });
      }
    } catch (err) {
      logger.warn('AI column mapping failed, using fallback synonyms', {
        error: err instanceof Error ? err.message : String(err),
        columnCount: headers.length
      });
    }

    logger.debug('Using mapping method', { aiMappingUsed, fallbackWillBeUsed: !aiMappingUsed });

    // Build column mapping response with AI + fallback synonym matching
    const columnMappings: ColumnMapping[] = headers.map((header) => {
      const normalizedHeader = header.toLowerCase();

      // Try AI mapping first
      let mappedTo = aiMappings[header] || aiMappings[normalizedHeader] || null;
      let confidence = aiConfidence[normalizedHeader] || 0;

      // Fallback to synonym matching if AI didn't map this column
      if (!mappedTo) {
        mappedTo = matchColumnToField(header);
        if (mappedTo) {
          confidence = 85; // High confidence for synonym match
        }
      } else {
        confidence = confidence || 70;
      }

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
      previewRows: rows.slice(0, 5),
      message: unmappedColumns.length > 0
        ? `${unmappedColumns.length} column(s) will be stored as custom data for AI to use`
        : 'All columns mapped successfully',
    });
  },
  { requireAuth: true }
);
