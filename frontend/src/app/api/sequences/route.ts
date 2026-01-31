import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserIdForCreate } from '@/lib/auth-utils';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  getPaginationParams,
  buildPaginationMeta,
  Errors,
} from '@/lib/api-utils';

// GET /api/sequences - List all sequences
export const GET = createApiHandler(
  async (request: NextRequest, { logger, user }) => {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const { page, limit, skip } = getPaginationParams(request, { limit: 50 });

    // Build where clause
    const where: Record<string, unknown> = {};

    if (user.role !== 'ADMIN') {
      where.userId = user.id;
    }

    if (status) {
      where.status = status;
    }

    logger.debug('Fetching sequences', { status, page, limit });

    const [sequences, total] = await Promise.all([
      prisma.sequence.findMany({
        where: where as any,
        include: {
          steps: {
            orderBy: { stepNumber: 'asc' },
          },
          _count: {
            select: {
              leads: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.sequence.count({ where: where as any }),
    ]);

    // Format response
    const formattedSequences = sequences.map((seq) => ({
      id: seq.id,
      name: seq.name,
      description: seq.description,
      status: seq.status,
      totalLeads: seq.totalLeads,
      activeLeads: seq.activeLeads,
      completedLeads: seq.completedLeads,
      steps: seq.steps.map((step) => ({
        id: step.id,
        stepNumber: step.stepNumber,
        delayDays: step.delayDays,
        delayHours: step.delayHours,
        subjectTemplate: step.subjectTemplate,
      })),
      createdAt: seq.createdAt,
      updatedAt: seq.updatedAt,
    }));

    logger.info('Fetched sequences', { count: sequences.length, total });

    return jsonResponse({
      sequences: formattedSequences,
      pagination: buildPaginationMeta(total, page, limit),
    });
  },
  { requireAuth: true }
);

// POST /api/sequences - Create a new sequence
export const POST = createApiHandler(
  async (request: NextRequest, { logger }) => {
    const userId = await getUserIdForCreate();
    if (!userId) {
      throw Errors.unauthorized();
    }

    const body = await parseJsonBody<{
      name?: string;
      description?: string;
      sesIdentityId?: string;
      timezone?: string;
      sendingDays?: number[];
      sendingHours?: { start: number; end: number };
      steps?: Array<{
        delayDays?: number;
        delayHours?: number;
        subjectTemplate?: string;
        bodyTemplate?: string;
        skipIfReplied?: boolean;
        skipIfClicked?: boolean;
        skipIfOpened?: boolean;
      }>;
    }>(request, logger);

    const { name, description, sesIdentityId, timezone, sendingDays, sendingHours, steps } = body;

    if (!name) {
      throw Errors.badRequest('Name is required', 'name');
    }

    logger.debug('Creating sequence', { name, stepsCount: steps?.length || 0 });

    // Create sequence with steps
    const sequence = await prisma.sequence.create({
      data: {
        userId,
        name,
        description: description || null,
        sesIdentityId: sesIdentityId || null,
        timezone: timezone || 'America/New_York',
        sendingDays: sendingDays || [1, 2, 3, 4, 5],
        sendingHours: sendingHours || { start: 9, end: 17 },
        steps: steps?.length
          ? {
              create: steps.map((step, index: number) => ({
                stepNumber: index + 1,
                delayDays: step.delayDays || 1,
                delayHours: step.delayHours || 0,
                subjectTemplate: step.subjectTemplate || '',
                bodyTemplate: step.bodyTemplate || '',
                skipIfReplied: step.skipIfReplied ?? true,
                skipIfClicked: step.skipIfClicked ?? false,
                skipIfOpened: step.skipIfOpened ?? false,
              })),
            }
          : undefined,
      },
      include: {
        steps: true,
      },
    });

    logger.info('Created sequence', { sequenceId: sequence.id, name });

    return jsonResponse(sequence, { status: 201 });
  },
  { requireAuth: true }
);
