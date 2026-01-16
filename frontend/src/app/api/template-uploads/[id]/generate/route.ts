import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { renderEmail, generateSignature, TemplateData } from '@/lib/template-engine';

// POST /api/template-uploads/[id]/generate - Generate emails from template CSV
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get upload with template and rows
    const upload = await prisma.templateUpload.findUnique({
      where: { id },
      include: {
        template: true,
        rows: {
          where: { status: 'PENDING' },
          orderBy: { rowIndex: 'asc' },
        },
      },
    });

    if (!upload) {
      return NextResponse.json(
        { error: 'Upload not found' },
        { status: 404 }
      );
    }

    if (upload.status !== 'PARSED') {
      return NextResponse.json(
        { error: 'Upload is not ready for generation' },
        { status: 400 }
      );
    }

    if (upload.rows.length === 0) {
      return NextResponse.json(
        { error: 'No valid rows to process' },
        { status: 400 }
      );
    }

    // Get settings for signature
    const settings = await prisma.adminSettings.findFirst();
    const signature = generateSignature({
      senderName: process.env.SENDER_NAME || 'Sagar Shankaran',
      senderTitle: process.env.SENDER_TITLE || 'Founder & CEO',
      companyName: process.env.COMPANY_NAME || 'CallSphere LLC',
    });

    const calendlyUrl = settings?.calendlyUrl || process.env.CALENDLY_URL || '';
    const businessAddress = settings?.businessAddress || process.env.BUSINESS_ADDRESS || '';

    // Get suppression list
    const suppressedEmails = await prisma.suppressionList.findMany({
      select: { email: true },
    });
    const suppressedSet = new Set(suppressedEmails.map(s => s.email.toLowerCase()));

    // Process each row
    const results = {
      created: 0,
      skipped: 0,
      errors: 0,
    };

    for (const row of upload.rows) {
      try {
        // Check suppression list
        if (suppressedSet.has(row.email.toLowerCase())) {
          await prisma.templateRow.update({
            where: { id: row.id },
            data: { status: 'SKIPPED', errorText: 'Email is suppressed' },
          });
          results.skipped++;
          continue;
        }

        // Check for existing contact or create new one
        let contact = await prisma.contact.findUnique({
          where: { email: row.email },
        });

        let business;
        const businessName = row.company || 'Unknown';

        if (contact) {
          business = await prisma.business.findUnique({
            where: { id: contact.businessId },
          });
          // Handle orphaned contact (business was deleted)
          if (!business) {
            // Upsert: find by name or create new
            business = await prisma.business.upsert({
              where: { canonicalName: businessName },
              update: {
                industryGuess: row.industry || undefined,
              },
              create: {
                canonicalName: businessName,
                industryGuess: row.industry,
              },
            });
            // Update contact to point to new business
            await prisma.contact.update({
              where: { id: contact.id },
              data: { businessId: business.id },
            });
          }
        } else {
          // Upsert business: update if exists, create if not
          business = await prisma.business.upsert({
            where: { canonicalName: businessName },
            update: {
              // Update industry if provided and not already set
              industryGuess: row.industry || undefined,
            },
            create: {
              canonicalName: businessName,
              industryGuess: row.industry,
            },
          });

          contact = await prisma.contact.create({
            data: {
              businessId: business.id,
              email: row.email,
              name: row.name,
              role: row.role,
              sourceConfidence: 100, // Direct from CSV
            },
          });
        }

        // Build template data
        const templateData: TemplateData = {
          email: row.email,
          name: row.name || 'there',
          company: row.company || business?.canonicalName || 'your company',
          role: row.role || '',
          industry: row.industry || business?.industryGuess || '',
          calendly_url: calendlyUrl,
          ...(row.customFields as Record<string, string>),
        };

        // Render email
        const rendered = renderEmail(
          {
            id: upload.template.id,
            category: upload.template.category,
            name: upload.template.name,
            subjectTemplate: upload.template.subjectTemplate,
            bodyTemplate: upload.template.bodyTemplate,
            variables: upload.template.variables as string[],
          },
          templateData,
          signature
        );

        // Safety check - business should always be defined at this point
        if (!business) {
          throw new Error('Failed to create or find business for contact');
        }

        // Create email draft
        const emailDraft = await prisma.emailDraft.create({
          data: {
            businessId: business.id,
            contactId: contact.id,
            subject: rendered.subject,
            bodyText: rendered.body,
            footerText: businessAddress,
            personalizationTokens: {
              templateId: upload.template.id,
              templateName: upload.template.name,
              variables: templateData,
            },
            confidenceScore: 100, // Templates are pre-approved
            deliverabilityScore: 100, // No AI scoring needed
            spamFlags: [],
            status: 'APPROVED', // Auto-approve template emails
            pipelineType: 'TEMPLATE',
            templateId: upload.template.id,
          },
        });

        // Update row with email draft reference
        await prisma.templateRow.update({
          where: { id: row.id },
          data: {
            status: 'PROCESSED',
            emailDraftId: emailDraft.id,
          },
        });

        results.created++;
      } catch (rowError) {
        console.error(`Error processing row ${row.rowIndex}:`, rowError);
        await prisma.templateRow.update({
          where: { id: row.id },
          data: {
            status: 'ERROR',
            errorText: rowError instanceof Error ? rowError.message : String(rowError),
          },
        });
        results.errors++;
      }

      // Update progress
      const processed = results.created + results.skipped + results.errors;
      if (processed % 10 === 0 || processed === upload.rows.length) {
        await prisma.templateUpload.update({
          where: { id: upload.id },
          data: {
            processedRows: processed,
            progressText: `Processing: ${processed}/${upload.rows.length} rows`,
          },
        });
      }
    }

    // Final update
    await prisma.templateUpload.update({
      where: { id: upload.id },
      data: {
        processedRows: results.created + results.skipped + results.errors,
        progressText: `Complete: ${results.created} emails created, ${results.skipped} skipped, ${results.errors} errors`,
      },
    });

    return NextResponse.json({
      message: 'Email generation complete',
      results,
    });
  } catch (error) {
    console.error('Error generating emails:', error);
    return NextResponse.json(
      { error: 'Failed to generate emails' },
      { status: 500 }
    );
  }
}
