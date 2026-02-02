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
    const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minutes

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

// Standard field names that we map to database columns
const STANDARD_FIELDS = ['email', 'business_name', 'website', 'industry', 'location', 'contact_name', 'role', 'phone', 'linkedin_url'];

// Get all unmapped columns and their values for AI to use
function extractCustomData(
  row: Record<string, string>,
  mappingDict: Record<string, string>
): Record<string, string> {
  const customData: Record<string, string> = {};
  const mappedSourceCols = new Set(Object.keys(mappingDict).map(k => k.toLowerCase()));

  for (const [key, value] of Object.entries(row)) {
    // Skip if this column was mapped to a standard field
    if (mappedSourceCols.has(key.toLowerCase())) continue;

    // Skip empty values
    if (!value || String(value).trim() === '') continue;

    // Store with normalized key (spaces to underscores, lowercase)
    const normalizedKey = key.toLowerCase().replace(/[\s\-]+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (normalizedKey) {
      customData[normalizedKey] = String(value).trim();
    }
  }

  return customData;
}

// Collect sample values for each column (first 3 non-empty values)
function collectSampleValues(
  rows: Record<string, string>[],
  columnName: string
): string[] {
  const samples: string[] = [];
  for (const row of rows) {
    const value = row[columnName];
    if (value && String(value).trim() && samples.length < 3) {
      samples.push(String(value).trim().substring(0, 100)); // Limit to 100 chars
    }
    if (samples.length >= 3) break;
  }
  return samples;
}

// Save column definitions for the campaign (tracks all imported columns)
async function saveColumnDefinitions(
  campaignId: string,
  headers: string[],
  rows: Record<string, string>[],
  mappingDict: Record<string, string>
) {
  const columns = headers.map((header, index) => {
    const normalizedKey = header.toLowerCase().replace(/[\s\-]+/g, '_').replace(/[^a-z0-9_]/g, '');
    const mappedTo = mappingDict[header] || mappingDict[header.toLowerCase()] || null;

    return {
      campaignId,
      name: header,
      key: normalizedKey || `col_${index}`,
      mappedTo: STANDARD_FIELDS.includes(mappedTo || '') ? mappedTo : null,
      type: 'text',
      sampleValues: collectSampleValues(rows, header),
      orderIndex: index,
    };
  });

  // Upsert column definitions
  for (const col of columns) {
    await prisma.businessColumn.upsert({
      where: {
        campaignId_key: {
          campaignId: col.campaignId,
          key: col.key,
        },
      },
      update: {
        name: col.name,
        mappedTo: col.mappedTo,
        sampleValues: col.sampleValues,
      },
      create: col,
    });
  }
}

// POST /api/campaigns/[id]/import - Import file directly into campaign
export const POST = createApiHandler(
  async (request: NextRequest, { logger, params }: HandlerContext) => {
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

    // Get AI column mappings
    const aiMapping = await getAIColumnMappings(headers, rows);
    const mappingDict = aiMapping?.mappingDict || {};
    const useAIMapping = Object.keys(mappingDict).length > 0;

    logger.debug('File parsed', {
      rowCount: rows.length,
      columnCount: headers.length,
      useAIMapping,
      mappedColumns: Object.keys(mappingDict).length,
      unmappedColumns: aiMapping?.unmappedColumns?.length || 0,
    });

    // Save column definitions for this campaign (tracks ALL columns)
    await saveColumnDefinitions(campaignId, headers, rows, mappingDict);

    const errors: Array<{ row: number; message: string }> = [];
    const invalidEmails: Array<{ row: number; email: string; reason: string }> = [];
    const duplicateEmails: Array<{ row: number; email: string }> = [];
    let created = 0;
    let skipped = 0;
    let blockedCount = 0;
    let duplicateCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      // Extract standard fields
      const email = useAIMapping
        ? extractWithAIMapping(row, 'email', mappingDict)
        : findColumn(row, getFieldSynonyms('email'));
      const name = useAIMapping
        ? extractWithAIMapping(row, 'business_name', mappingDict)
        : findColumn(row, getFieldSynonyms('name'));

      const missingFields: string[] = [];
      let validationStatus: 'VALID' | 'INVALID' | 'RISKY' | 'BLOCKED' = 'VALID';
      let validationDetails: {
        formatValid: boolean;
        mxValid: boolean;
        isDisposable: boolean;
        isRoleAccount: boolean;
        isBlocked: boolean;
        reason?: string;
        warnings: string[];
      } = {
        formatValid: false,
        mxValid: false,
        isDisposable: false,
        isRoleAccount: false,
        isBlocked: false,
        warnings: [],
      };

      if (!email) {
        missingFields.push('email');
      } else {
        // Full email validation with MX record check
        const validation = await validateEmail(email);
        validationDetails.formatValid = !validation.errors.some(e => e.includes('format') || e.includes('Invalid'));
        validationDetails.mxValid = !validation.errors.some(e => e.includes('MX') || e.includes('mail server'));
        validationDetails.isDisposable = validation.errors.some(e => e.includes('disposable') || e.includes('temporary'));
        validationDetails.isRoleAccount = validation.warnings?.some(w => w.includes('role')) ?? false;
        validationDetails.warnings = validation.warnings || [];

        if (!validation.isValid) {
          const reason = validation.errors.join('; ');
          validationDetails.reason = reason;
          validationStatus = 'INVALID';
          invalidEmails.push({ row: rowNum, email, reason });
          errors.push({ row: rowNum, message: `Invalid email: ${reason}` });
          skipped++;
          continue;
        }

        // Check for risky emails (role accounts, etc.)
        if (validationDetails.isRoleAccount || validationDetails.warnings.length > 0) {
          validationStatus = 'RISKY';
        }

        // Check if email is in suppression list (bounced/complained before)
        const blocked = await isEmailBlocked(email, prisma);
        if (blocked.blocked) {
          validationDetails.isBlocked = true;
          validationDetails.reason = blocked.reason || 'Blocked';
          validationStatus = 'BLOCKED';
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

      // Extract all standard fields
      const website = useAIMapping
        ? extractWithAIMapping(row, 'website', mappingDict)
        : findColumn(row, getFieldSynonyms('website'));
      const industry = useAIMapping
        ? extractWithAIMapping(row, 'industry', mappingDict)
        : findColumn(row, getFieldSynonyms('industry'));
      const location = useAIMapping
        ? extractWithAIMapping(row, 'location', mappingDict)
        : findColumn(row, getFieldSynonyms('location'));
      const contactName = useAIMapping
        ? extractWithAIMapping(row, 'contact_name', mappingDict)
        : findColumn(row, getFieldSynonyms('contactName'));
      const role = useAIMapping
        ? extractWithAIMapping(row, 'role', mappingDict)
        : findColumn(row, getFieldSynonyms('role'));
      const phone = useAIMapping
        ? extractWithAIMapping(row, 'phone', mappingDict)
        : findColumn(row, ['phone', 'telephone', 'mobile', 'cell', 'contact_phone']);
      const linkedinUrl = useAIMapping
        ? extractWithAIMapping(row, 'linkedin_url', mappingDict)
        : findColumn(row, ['linkedin', 'linkedin_url', 'linkedin_profile', 'profile_url']);

      // Extract ALL unmapped columns as customData for AI to use
      const customData = extractCustomData(row, mappingDict);

      try {
        const businessName = name!;
        const contactEmail = email!.toLowerCase();

        // Check if contact with this email already exists BEFORE transaction
        // Skip duplicate emails entirely - don't create or update
        const existingContact = await prisma.contact.findUnique({
          where: { email: contactEmail },
          select: { id: true, email: true },
        });

        if (existingContact) {
          // Skip this row - email already exists in the system
          duplicateEmails.push({ row: rowNum, email: contactEmail });
          duplicateCount++;
          skipped++;
          continue;
        }

        // Use transaction to ensure business and contact are created together
        // If contact creation fails, business creation is rolled back
        await prisma.$transaction(async (tx) => {
          const existingBusiness = await tx.business.findUnique({
            where: { canonicalName: businessName },
          });

          let businessId: string;

          if (existingBusiness) {
            businessId = existingBusiness.id;
            // Merge existing customData with new data
            const existingCustomData = (existingBusiness.customData as Record<string, string>) || {};
            const mergedCustomData = { ...existingCustomData, ...customData };

            // Update business with campaign assignment and any new info
            await tx.business.update({
              where: { id: businessId },
              data: {
                campaignId, // Assign to this campaign
                website: website || existingBusiness.website,
                industryGuess: industry || existingBusiness.industryGuess,
                location: location || existingBusiness.location,
                customData: mergedCustomData, // Store ALL extra columns for AI
              },
            });
          } else {
            const newBusiness = await tx.business.create({
              data: {
                userId,
                campaignId, // Assign to this campaign
                canonicalName: businessName,
                website,
                industryGuess: industry,
                location,
                customData, // Store ALL extra columns for AI
              },
            });
            businessId = newBusiness.id;
          }

          // Create contact - we already checked it doesn't exist above
          await tx.contact.create({
            data: {
              businessId,
              email: contactEmail,
              name: contactName,
              role,
              phone,
              linkedinUrl,
              customData, // Store extra columns on contact too for AI
              sourceConfidence: 80,
              // Email validation fields
              emailValidated: true,
              validationStatus,
              validatedAt: new Date(),
              validationDetails,
            },
          });
        });

        created++;
      } catch (dbError) {
        logger.error('Error importing row (transaction rolled back)', dbError, { row: rowNum, business: name, email });
        errors.push({ row: rowNum, message: `Failed to import: ${dbError instanceof Error ? dbError.message : 'Database error'}` });
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

    // Update campaign validation metrics
    const validationStats = await prisma.contact.groupBy({
      by: ['validationStatus'],
      where: {
        business: { campaignId },
      },
      _count: true,
    });

    const totalContacts = validationStats.reduce((sum, s) => sum + s._count, 0);
    const validEmails = validationStats.find(s => s.validationStatus === 'VALID')?._count || 0;
    const invalidEmailsCount = validationStats.find(s => s.validationStatus === 'INVALID')?._count || 0;
    const riskyEmails = validationStats.find(s => s.validationStatus === 'RISKY')?._count || 0;
    const blockedEmailsCount = validationStats.find(s => s.validationStatus === 'BLOCKED')?._count || 0;
    const validationRate = totalContacts > 0 ? ((validEmails + riskyEmails) / totalContacts) * 100 : 0;

    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        totalContacts,
        validatedContacts: totalContacts, // All contacts were validated during import
        validEmails,
        invalidEmails: invalidEmailsCount,
        riskyEmails,
        blockedEmails: blockedEmailsCount,
        validationRate: Math.round(validationRate * 100) / 100,
      },
    });

    logger.info('Import completed', {
      created,
      skipped,
      blockedCount,
      duplicateCount,
      invalidEmailCount: invalidEmails.length,
      totalColumns: headers.length,
      mappedColumns: Object.keys(mappingDict).length,
      validationStats: { totalContacts, validEmails, invalidEmailsCount, riskyEmails, validationRate },
    });

    return jsonResponse({
      message: 'File uploaded and processed',
      upload,
      created,
      skipped,
      blockedCount,
      duplicateCount,
      invalidEmailCount: invalidEmails.length,
      errors: errors.slice(0, 50),
      invalidEmails: invalidEmails.slice(0, 20), // Show first 20 invalid emails
      duplicateEmails: duplicateEmails.slice(0, 20), // Show first 20 duplicate emails
      campaignId,
      columnStats: {
        totalColumns: headers.length,
        mappedToStandard: Object.keys(mappingDict).length,
        storedAsCustom: headers.length - Object.keys(mappingDict).length,
        columns: headers,
      },
    });
  },
  { requireAuth: true }
);
