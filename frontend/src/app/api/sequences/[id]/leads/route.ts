import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { validateEmail, isEmailBlocked } from '@/lib/email-validator';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  getPaginationParams,
  buildPaginationMeta,
  Errors,
} from '@/lib/api-utils';

// GET /api/sequences/[id]/leads - List leads in a sequence
export const GET = createApiHandler(
  async (request: NextRequest, { logger, user, params }) => {
    const { id: sequenceId } = params;
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const { page, limit, skip } = getPaginationParams(request, { limit: 50 });

    logger.debug('Fetching sequence leads', { sequenceId, status, page, limit });

    // Verify sequence access
    const sequence = await prisma.sequence.findFirst({
      where: {
        id: sequenceId,
        ...(user.role !== 'ADMIN' ? { userId: user.id } : {}),
      },
    });

    if (!sequence) {
      throw Errors.notFound('Sequence');
    }

    // Build where clause
    const where: Record<string, unknown> = {
      sequenceId,
    };

    if (status) {
      where.status = status;
    }

    const [leads, total] = await Promise.all([
      prisma.sequenceLead.findMany({
        where: where as any,
        include: {
          contact: true,
          business: true,
          steps: {
            include: {
              step: true,
            },
          },
        },
        orderBy: { enrolledAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.sequenceLead.count({ where: where as any }),
    ]);

    logger.info('Fetched sequence leads', { sequenceId, count: leads.length, total });

    return jsonResponse({
      leads,
      pagination: buildPaginationMeta(total, page, limit),
    });
  },
  { requireAuth: true }
);

// POST /api/sequences/[id]/leads - Add leads to a sequence
export const POST = createApiHandler(
  async (request: NextRequest, { logger, user, params }) => {
    const { id: sequenceId } = params;

    const body = await parseJsonBody<{
      leadIds?: string[];
      campaignId?: string;
      contactIds?: string[];
      businessIds?: string[];
    }>(request, logger);

    const { leadIds, campaignId, contactIds, businessIds } = body;

    logger.debug('Adding leads to sequence', {
      sequenceId,
      leadIdsCount: leadIds?.length || 0,
      contactIdsCount: contactIds?.length || 0,
    });

    // Verify sequence access
    const sequence = await prisma.sequence.findFirst({
      where: {
        id: sequenceId,
        ...(user.role !== 'ADMIN' ? { userId: user.id } : {}),
      },
      include: {
        steps: {
          orderBy: { stepNumber: 'asc' },
        },
      },
    });

    if (!sequence) {
      throw Errors.notFound('Sequence');
    }

    if (sequence.steps.length === 0) {
      throw Errors.badRequest('Sequence has no steps configured');
    }

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Handle adding leads from campaign Lead model
    if (leadIds && leadIds.length > 0 && campaignId) {
      // Fetch leads from the Lead model
      const leads = await prisma.lead.findMany({
        where: {
          id: { in: leadIds },
          campaignId,
          ...(user.role !== 'ADMIN' ? { userId: user.id } : {}),
        },
      });

      for (const lead of leads) {
        try {
          // Validate email before processing
          const emailValidation = await validateEmail(lead.email);
          if (!emailValidation.isValid) {
            errors.push(`Lead ${lead.email}: Invalid email - ${emailValidation.errors.join(', ')}`);
            skipped++;
            continue;
          }

          // Check if email is blocked (in suppression list)
          const blocked = await isEmailBlocked(lead.email, prisma);
          if (blocked.blocked) {
            errors.push(`Lead ${lead.email}: ${blocked.reason}`);
            skipped++;
            continue;
          }

          // First, ensure a Business exists for this lead
          let business = await prisma.business.findFirst({
            where: { canonicalName: lead.company?.toLowerCase() || `lead-${lead.id}` },
          });

          if (!business) {
            business = await prisma.business.create({
              data: {
                canonicalName: lead.company?.toLowerCase() || `lead-${lead.id}`,
                website: lead.website,
                industryGuess: lead.industry,
                location: lead.location,
                userId: user.id,
                campaignId,
              },
            });
          }

          // Ensure a Contact exists for this lead
          let contact = await prisma.contact.findUnique({
            where: { email: lead.email },
          });

          if (!contact) {
            contact = await prisma.contact.create({
              data: {
                businessId: business.id,
                email: lead.email,
                name: [lead.firstName, lead.lastName].filter(Boolean).join(' ') || null,
                role: lead.title,
              },
            });
          }

          // Check if already in sequence
          const existing = await prisma.sequenceLead.findUnique({
            where: {
              sequenceId_contactId: {
                sequenceId,
                contactId: contact.id,
              },
            },
          });

          if (existing) {
            skipped++;
            continue;
          }

          // Create sequence lead
          const sequenceLead = await prisma.sequenceLead.create({
            data: {
              sequenceId,
              contactId: contact.id,
              businessId: business.id,
              status: 'ACTIVE',
            },
          });

          // Create pending steps for this lead
          const firstStep = sequence.steps[0];
          if (firstStep) {
            // Calculate first step scheduled time
            const scheduledFor = new Date();
            scheduledFor.setDate(scheduledFor.getDate() + firstStep.delayDays);
            scheduledFor.setHours(scheduledFor.getHours() + firstStep.delayHours);

            await prisma.sequenceLeadStep.create({
              data: {
                sequenceLeadId: sequenceLead.id,
                stepId: firstStep.id,
                status: 'SCHEDULED',
                scheduledFor,
              },
            });
          }

          // Update lead status
          await prisma.lead.update({
            where: { id: lead.id },
            data: { status: 'CONTACTED' },
          });

          created++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          errors.push(`Lead ${lead.email}: ${msg}`);
          skipped++;
        }
      }
    }

    // Handle adding from existing contacts/businesses
    if (contactIds && businessIds && contactIds.length > 0) {
      for (let i = 0; i < contactIds.length; i++) {
        const contactId = contactIds[i];
        const businessId = businessIds[i];

        try {
          // Check if already in sequence
          const existing = await prisma.sequenceLead.findUnique({
            where: {
              sequenceId_contactId: {
                sequenceId,
                contactId,
              },
            },
          });

          if (existing) {
            skipped++;
            continue;
          }

          // Create sequence lead
          const sequenceLead = await prisma.sequenceLead.create({
            data: {
              sequenceId,
              contactId,
              businessId,
              status: 'ACTIVE',
            },
          });

          // Create pending steps for this lead
          const firstStep = sequence.steps[0];
          if (firstStep) {
            const scheduledFor = new Date();
            scheduledFor.setDate(scheduledFor.getDate() + firstStep.delayDays);
            scheduledFor.setHours(scheduledFor.getHours() + firstStep.delayHours);

            await prisma.sequenceLeadStep.create({
              data: {
                sequenceLeadId: sequenceLead.id,
                stepId: firstStep.id,
                status: 'SCHEDULED',
                scheduledFor,
              },
            });
          }

          created++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          errors.push(`Contact ${contactId}: ${msg}`);
          skipped++;
        }
      }
    }

    // Update sequence lead counts
    const [totalLeads, activeLeads, completedLeads] = await Promise.all([
      prisma.sequenceLead.count({ where: { sequenceId } }),
      prisma.sequenceLead.count({ where: { sequenceId, status: 'ACTIVE' } }),
      prisma.sequenceLead.count({ where: { sequenceId, status: 'COMPLETED' } }),
    ]);

    await prisma.sequence.update({
      where: { id: sequenceId },
      data: {
        totalLeads,
        activeLeads,
        completedLeads,
      },
    });

    logger.info('Added leads to sequence', { sequenceId, created, skipped, errorsCount: errors.length });

    return jsonResponse({
      success: true,
      created,
      skipped,
      total: created + skipped,
      errors: errors.slice(0, 10),
    });
  },
  { requireAuth: true }
);

// DELETE /api/sequences/[id]/leads - Remove leads from sequence
export const DELETE = createApiHandler(
  async (request: NextRequest, { logger, user, params }) => {
    const { id: sequenceId } = params;

    const body = await parseJsonBody<{
      sequenceLeadIds?: string[];
    }>(request, logger);

    const { sequenceLeadIds } = body;

    if (!Array.isArray(sequenceLeadIds) || sequenceLeadIds.length === 0) {
      throw Errors.badRequest('sequenceLeadIds array is required', 'sequenceLeadIds');
    }

    logger.debug('Removing leads from sequence', { sequenceId, count: sequenceLeadIds.length });

    // Verify sequence access
    const sequence = await prisma.sequence.findFirst({
      where: {
        id: sequenceId,
        ...(user.role !== 'ADMIN' ? { userId: user.id } : {}),
      },
    });

    if (!sequence) {
      throw Errors.notFound('Sequence');
    }

    // Delete sequence leads
    const result = await prisma.sequenceLead.deleteMany({
      where: {
        id: { in: sequenceLeadIds },
        sequenceId,
      },
    });

    // Update sequence lead counts
    const [totalLeads, activeLeads, completedLeads] = await Promise.all([
      prisma.sequenceLead.count({ where: { sequenceId } }),
      prisma.sequenceLead.count({ where: { sequenceId, status: 'ACTIVE' } }),
      prisma.sequenceLead.count({ where: { sequenceId, status: 'COMPLETED' } }),
    ]);

    await prisma.sequence.update({
      where: { id: sequenceId },
      data: {
        totalLeads,
        activeLeads,
        completedLeads,
      },
    });

    logger.info('Removed leads from sequence', { sequenceId, deleted: result.count });

    return jsonResponse({ deleted: result.count });
  },
  { requireAuth: true }
);
