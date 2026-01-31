import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  Errors,
} from '@/lib/api-utils';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

interface GenerateEmailsRequest {
  businessIds: string[];
}

interface GenerateEmailsResponse {
  success: boolean;
  emailsCreated: number;
  businessesProcessed: number;
  message?: string;
  error?: string;
  warning?: string;
  skippedBusinesses?: string[];
  errors?: string[];
}

// POST /api/businesses/generate-emails - Generate emails for selected businesses
export const POST = createApiHandler<GenerateEmailsResponse>(
  async (request: NextRequest, { logger }) => {
    const body = await parseJsonBody<GenerateEmailsRequest>(request, logger);
    const { businessIds } = body;

    if (!businessIds || !Array.isArray(businessIds) || businessIds.length === 0) {
      throw Errors.badRequest('Business IDs are required', 'businessIds');
    }

    logger.debug('Generating emails for businesses', { businessCount: businessIds.length });

    // Fetch businesses with their contacts and evidence
    const businesses = await prisma.business.findMany({
      where: { id: { in: businessIds } },
      include: {
        contacts: {
          take: 5, // Limit contacts per business
        },
        evidence: {
          take: 10,
          select: {
            id: true,
            evidenceType: true,
            extractedValue: true,
            confidence: true,
          },
        },
      },
    });

    if (businesses.length === 0) {
      throw Errors.notFound('No businesses found');
    }

    // Check if any business has contacts
    const businessesWithContacts = businesses.filter(b => b.contacts.length > 0);
    const businessesWithoutContacts = businesses.filter(b => b.contacts.length === 0);

    if (businessesWithContacts.length === 0) {
      const names = businessesWithoutContacts.slice(0, 3).map(b => b.canonicalName).join(', ');
      const more = businessesWithoutContacts.length > 3 ? ` and ${businessesWithoutContacts.length - 3} more` : '';
      throw Errors.badRequest(
        `No contacts found for selected companies (${names}${more}). Please add contacts first before generating emails.`
      );
    }

    // Get industry playbooks
    const playbooks = await prisma.industryPlaybook.findMany();
    const playbookMap: Record<string, Record<string, unknown>> = {};
    for (const pb of playbooks) {
      playbookMap[pb.industry.toLowerCase()] = {
        industry: pb.industry,
        commonPainPoints: pb.commonPainPoints,
        valueProps: pb.valueProps,
        subjectAngles: pb.subjectAngles,
        safeClaims: pb.safeClaims,
        bannedPhrases: pb.bannedPhrases,
      };
    }

    let emailsCreated = 0;
    let businessesProcessed = 0;
    const errors: string[] = [];

    // Process each business with contacts
    for (const business of businessesWithContacts) {
      businessesProcessed++;

      // Get industry playbook if available
      const industry = business.industryGuess?.toLowerCase() || '';
      const industryPlaybook = playbookMap[industry] || null;

      // Process each contact
      for (const contact of business.contacts) {
        try {
          // Call AI service to generate email for this contact
          const response = await fetch(`${AI_SERVICE_URL}/generate-email-for-contact`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              business: {
                id: business.id,
                canonicalName: business.canonicalName,
                website: business.website,
                industryGuess: business.industryGuess,
                location: business.location,
              },
              contact: {
                id: contact.id,
                email: contact.email,
                name: contact.name,
                role: contact.role,
              },
              evidence: business.evidence.map(ev => ({
                id: ev.id,
                evidenceType: ev.evidenceType,
                extractedValue: ev.extractedValue,
                confidence: ev.confidence,
              })),
              industryPlaybook,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'AI service error');
          }

          const result = await response.json();

          if (!result.success) {
            throw new Error(result.error || 'Failed to generate email');
          }

          // Save email to database
          await prisma.emailDraft.create({
            data: {
              businessId: business.id,
              contactId: contact.id,
              subject: result.subject,
              bodyText: result.body_text,
              footerText: result.footer_text || '',
              personalizationTokens: result.personalization_tokens || {},
              confidenceScore: result.confidence_score,
              deliverabilityScore: result.deliverability_score,
              spamFlags: result.spam_flags || [],
              status: result.status === 'needs_review' ? 'NEEDS_REVIEW' : 'DRAFT',
            },
          });

          emailsCreated++;
        } catch (contactError) {
          const errorMsg = `Error generating email for ${contact.email}: ${contactError instanceof Error ? contactError.message : String(contactError)}`;
          logger.error('Failed to generate email for contact', contactError, {
            contactEmail: contact.email,
            businessId: business.id,
          });
          errors.push(errorMsg);
        }
      }
    }

    // Build response with warnings if some businesses were skipped
    const skippedNames = businessesWithoutContacts.slice(0, 3).map(b => b.canonicalName);
    const skippedMore = businessesWithoutContacts.length > 3 ? ` and ${businessesWithoutContacts.length - 3} more` : '';

    let message = `Generated ${emailsCreated} email(s) for ${businessesProcessed} companies`;
    let warning = '';

    if (businessesWithoutContacts.length > 0) {
      warning = `Skipped ${businessesWithoutContacts.length} company(ies) with no contacts: ${skippedNames.join(', ')}${skippedMore}`;
    }

    if (emailsCreated === 0 && businessesProcessed > 0) {
      const errorDetail = errors.length > 0 ? `: ${errors[0]}` : '';
      logger.error('AI service did not generate any emails', null, {
        businessesProcessed,
        errorCount: errors.length,
      });
      return jsonResponse({
        success: false,
        emailsCreated: 0,
        businessesProcessed,
        error: `AI service did not generate any emails${errorDetail}`,
        warning,
        errors: errors.length > 0 ? errors : undefined,
      }, { status: 500 });
    }

    logger.info('Email generation completed', {
      emailsCreated,
      businessesProcessed,
      skippedCount: businessesWithoutContacts.length,
      errorCount: errors.length,
    });

    return jsonResponse({
      success: true,
      emailsCreated,
      businessesProcessed,
      message,
      warning: warning || undefined,
      skippedBusinesses: businessesWithoutContacts.length > 0 ? businessesWithoutContacts.map(b => b.canonicalName) : undefined,
      errors: errors.length > 0 ? errors : undefined,
    });
  },
  { requireAuth: true }
);
