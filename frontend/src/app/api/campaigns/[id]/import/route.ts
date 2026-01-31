import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import storage from '@/lib/storage';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { getUserFilter, getUserIdForCreate } from '@/lib/auth-utils';
import { validateEmail, isEmailBlocked } from '@/lib/email-validator';
import {
  createApiHandler,
  jsonResponse,
  Errors,
  HandlerContext,
} from '@/lib/api-utils';

// Supported file types
const SUPPORTED_EXTENSIONS = ['csv', 'xlsx', 'xls', 'json', 'tsv', 'txt'];

// AI Service URL for column mapping
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

// Types for AI column mapping response
interface ColumnMappingItem {
  sourceColumn: string;
  targetField: string;
  confidence: number;
  reasoning: string;
}

interface AIColumnMappingResponse {
  mappings: ColumnMappingItem[];
  mappingDict: Record<string, string>;
  unmappedColumns: string[];
  warnings: string[];
}

// Call AI service to get intelligent column mappings (with 5s timeout)
async function getAIColumnMappings(
  headers: string[],
  sampleRows: Record<string, string>[]
): Promise<AIColumnMappingResponse | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${AI_SERVICE_URL}/map-columns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        headers,
        sampleRows: sampleRows.slice(0, 5),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

// Extract field value using AI mapping
function extractWithAIMapping(
  row: Record<string, string>,
  targetField: string,
  mappingDict: Record<string, string>
): string | null {
  for (const [sourceCol, target] of Object.entries(mappingDict)) {
    if (target === targetField) {
      const key = Object.keys(row).find(k => k.toLowerCase() === sourceCol.toLowerCase());
      if (key && row[key]) {
        return String(row[key]).trim();
      }
    }
  }
  return null;
}

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

function normalizeColumnName(name: string): string {
  return name.toLowerCase().replace(/[\s_\-]/g, '');
}

const COLUMN_SYNONYMS: Record<string, string[]> = {
  email: ['email', 'e-mail', 'email_address', 'emailaddress', 'mail', 'contact_email', 'contactemail', 'work_email', 'workemail'],
  name: [
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
  website: ['website', 'url', 'web', 'site', 'web_url', 'weburl', 'homepage', 'home_page', 'domain', 'web_address', 'webaddress', 'link'],
  industry: ['industry', 'sector', 'business_type', 'businesstype', 'type', 'category', 'vertical', 'market', 'field', 'niche', 'segment'],
  location: ['location', 'address', 'city', 'region', 'country', 'state', 'place', 'area', 'territory', 'headquarters', 'hq', 'office_location', 'officelocation'],
  contactName: [
    'contact_name', 'contactname', 'contact', 'person',
    'first_name', 'firstname', 'name', 'full_name', 'fullname',
    'contact_person', 'contactperson', 'representative', 'rep',
    'poc', 'point_of_contact', 'pointofcontact'
  ],
  role: ['role', 'title', 'position', 'job_title', 'jobtitle', 'designation', 'job', 'job_role', 'jobrole', 'occupation', 'function']
};

function findColumn(row: Record<string, string>, possibleNames: string[]): string | null {
  const normalizedPossibleNames = possibleNames.map(normalizeColumnName);

  for (const key of Object.keys(row)) {
    const normalizedKey = normalizeColumnName(key);
    if (normalizedPossibleNames.includes(normalizedKey) && row[key]) {
      return String(row[key]).trim();
    }
  }
  return null;
}

function getFieldSynonyms(field: keyof typeof COLUMN_SYNONYMS): string[] {
  return COLUMN_SYNONYMS[field] || [];
}

// POST /api/campaigns/[id]/import - Import file directly into campaign
export const POST = createApiHandler(
  async (request: NextRequest, { logger, user, params }: HandlerContext) => {
    const campaignId = params.id;
    const userFilter = await getUserFilter();

    logger.debug('Importing file to campaign', { campaignId });

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

    const userId = await getUserIdForCreate();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      throw Errors.badRequest('No file provided');
    }

    const filename = file.name;
    const fileType = file.name.split('.').pop()?.toLowerCase() || 'unknown';
    const sizeBytes = file.size;

    if (!SUPPORTED_EXTENSIONS.includes(fileType)) {
      throw Errors.badRequest(`Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = await storage.save(buffer, filename);

    let rows: Record<string, string>[];
    let headers: string[];
    try {
      const parsed = parseFile(buffer, filename);
      rows = parsed.rows;
      headers = parsed.headers;
    } catch (parseError) {
      await prisma.upload.create({
        data: {
          userId,
          campaignId,
          filename,
          fileType,
          sizeBytes,
          storagePath,
          status: 'FAILED',
          errorText: parseError instanceof Error ? parseError.message : 'Failed to parse file',
        },
      });

      throw Errors.badRequest(parseError instanceof Error ? parseError.message : 'Failed to parse file');
    }

    const aiMapping = await getAIColumnMappings(headers, rows);
    const useAIMapping = aiMapping && Object.keys(aiMapping.mappingDict).length > 0;

    logger.debug('File parsed', { rowCount: rows.length, useAIMapping });

    const errors: Array<{ row: number; message: string }> = [];
    const invalidEmails: Array<{ row: number; email: string; reason: string }> = [];
    let created = 0;
    let skipped = 0;
    let blockedCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const email = useAIMapping
        ? extractWithAIMapping(row, 'email', aiMapping.mappingDict)
        : findColumn(row, getFieldSynonyms('email'));
      const name = useAIMapping
        ? extractWithAIMapping(row, 'business_name', aiMapping.mappingDict)
        : findColumn(row, getFieldSynonyms('name'));

      const missingFields: string[] = [];
      if (!email) {
        missingFields.push('email');
      } else {
        // Full email validation with MX record check
        const validation = await validateEmail(email);
        if (!validation.isValid) {
          const reason = validation.errors.join('; ');
          invalidEmails.push({ row: rowNum, email, reason });
          errors.push({ row: rowNum, message: `Invalid email: ${reason}` });
          skipped++;
          continue;
        }

        // Check if email is in suppression list (bounced/complained before)
        const blocked = await isEmailBlocked(email, prisma);
        if (blocked.blocked) {
          invalidEmails.push({ row: rowNum, email, reason: blocked.reason || 'Blocked' });
          errors.push({ row: rowNum, message: `Email blocked: ${blocked.reason}` });
          blockedCount++;
          skipped++;
          continue;
        }
      }

      if (!name) {
        missingFields.push('name (business name)');
      }

      if (missingFields.length > 0) {
        errors.push({ row: rowNum, message: `Missing required fields: ${missingFields.join(', ')}` });
        skipped++;
        continue;
      }

      const website = useAIMapping
        ? extractWithAIMapping(row, 'website', aiMapping.mappingDict)
        : findColumn(row, getFieldSynonyms('website'));
      const industry = useAIMapping
        ? extractWithAIMapping(row, 'industry', aiMapping.mappingDict)
        : findColumn(row, getFieldSynonyms('industry'));
      const location = useAIMapping
        ? extractWithAIMapping(row, 'location', aiMapping.mappingDict)
        : findColumn(row, getFieldSynonyms('location'));
      const contactName = useAIMapping
        ? extractWithAIMapping(row, 'contact_name', aiMapping.mappingDict)
        : findColumn(row, getFieldSynonyms('contactName'));
      const role = useAIMapping
        ? extractWithAIMapping(row, 'role', aiMapping.mappingDict)
        : findColumn(row, getFieldSynonyms('role'));

      try {
        const businessName = name!;
        const contactEmail = email!;

        const existingBusiness = await prisma.business.findUnique({
          where: { canonicalName: businessName },
        });

        let businessId: string;

        if (existingBusiness) {
          businessId = existingBusiness.id;
          // Update business with campaign assignment and any new info
          await prisma.business.update({
            where: { id: businessId },
            data: {
              campaignId, // Assign to this campaign
              website: website || existingBusiness.website,
              industryGuess: industry || existingBusiness.industryGuess,
              location: location || existingBusiness.location,
            },
          });
        } else {
          const newBusiness = await prisma.business.create({
            data: {
              userId,
              campaignId, // Assign to this campaign
              canonicalName: businessName,
              website,
              industryGuess: industry,
              location,
            },
          });
          businessId = newBusiness.id;
        }

        const existingContact = await prisma.contact.findUnique({
          where: { email: contactEmail.toLowerCase() },
        });

        if (!existingContact) {
          await prisma.contact.create({
            data: {
              businessId,
              email: contactEmail.toLowerCase(),
              name: contactName,
              role,
              sourceConfidence: 80,
            },
          });
        }

        created++;
      } catch (dbError) {
        logger.error('Error creating business', dbError, { row: rowNum });
        errors.push({ row: rowNum, message: 'Database error' });
        skipped++;
      }
    }

    const upload = await prisma.upload.create({
      data: {
        userId,
        campaignId, // Associate upload with campaign
        filename,
        fileType,
        sizeBytes,
        storagePath,
        status: 'PARSED',
        progressText: `Imported ${created} businesses, skipped ${skipped}`,
      },
    });

    logger.info('Import completed', { created, skipped, blockedCount, invalidEmailCount: invalidEmails.length });

    return jsonResponse({
      message: 'File uploaded and processed',
      upload,
      created,
      skipped,
      blockedCount,
      invalidEmailCount: invalidEmails.length,
      errors: errors.slice(0, 50),
      invalidEmails: invalidEmails.slice(0, 20), // Show first 20 invalid emails
      campaignId,
    });
  },
  { requireAuth: true }
);
