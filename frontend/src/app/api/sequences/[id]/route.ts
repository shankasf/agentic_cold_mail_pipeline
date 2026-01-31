import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  Errors,
} from '@/lib/api-utils';

// GET /api/sequences/[id] - Get a single sequence
export const GET = createApiHandler(
  async (request: NextRequest, { logger, user, params }) => {
    const { id } = params;

    logger.debug('Fetching sequence', { sequenceId: id });

    const sequence = await prisma.sequence.findFirst({
      where: {
        id,
        ...(user.role !== 'ADMIN' ? { userId: user.id } : {}),
      },
      include: {
        steps: {
          orderBy: { stepNumber: 'asc' },
        },
        sesIdentity: {
          select: {
            id: true,
            emailAddress: true,
            displayName: true,
            status: true,
          },
        },
        _count: {
          select: {
            leads: true,
          },
        },
      },
    });

    if (!sequence) {
      throw Errors.notFound('Sequence');
    }

    logger.info('Fetched sequence', { sequenceId: id, stepsCount: sequence.steps.length });

    return jsonResponse(sequence);
  },
  { requireAuth: true }
);

// PATCH /api/sequences/[id] - Update a sequence
export const PATCH = createApiHandler(
  async (request: NextRequest, { logger, user, params }) => {
    const { id } = params;

    const body = await parseJsonBody<{
      name?: string;
      description?: string;
      status?: string;
      sesIdentityId?: string;
      timezone?: string;
      sendingDays?: number[];
      sendingHours?: { start: number; end: number };
      steps?: Array<{
        delayDays?: number;
        delayHours?: number;
        subjectTemplate?: string;
        subject?: string;
        bodyTemplate?: string;
        body?: string;
        skipIfReplied?: boolean;
        skipIfClicked?: boolean;
        skipIfOpened?: boolean;
      }>;
    }>(request, logger);

    logger.debug('Updating sequence', { sequenceId: id });

    // Verify sequence access
    const sequence = await prisma.sequence.findFirst({
      where: {
        id,
        ...(user.role !== 'ADMIN' ? { userId: user.id } : {}),
      },
      include: {
        steps: true,
      },
    });

    if (!sequence) {
      throw Errors.notFound('Sequence');
    }

    const {
      name,
      description,
      status,
      sesIdentityId,
      timezone,
      sendingDays,
      sendingHours,
      steps,
    } = body;

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (sesIdentityId !== undefined) updateData.sesIdentityId = sesIdentityId;
    if (timezone !== undefined) updateData.timezone = timezone;
    if (sendingDays !== undefined) updateData.sendingDays = sendingDays;
    if (sendingHours !== undefined) updateData.sendingHours = sendingHours;

    // If status is changing to ACTIVE, set startedAt
    if (status === 'ACTIVE' && sequence.status !== 'ACTIVE') {
      updateData.startedAt = new Date();
    }

    // If status is changing to COMPLETED, set completedAt
    if (status === 'COMPLETED' && sequence.status !== 'COMPLETED') {
      updateData.completedAt = new Date();
    }

    // Update sequence
    await prisma.sequence.update({
      where: { id },
      data: updateData as any,
    });

    // Update steps if provided
    if (steps !== undefined && Array.isArray(steps)) {
      // Delete existing steps
      await prisma.sequenceStep.deleteMany({
        where: { sequenceId: id },
      });

      // Create new steps
      if (steps.length > 0) {
        await prisma.sequenceStep.createMany({
          data: steps.map((step, index: number) => ({
            sequenceId: id,
            stepNumber: index + 1,
            delayDays: step.delayDays || 1,
            delayHours: step.delayHours || 0,
            subjectTemplate: step.subjectTemplate || step.subject || '',
            bodyTemplate: step.bodyTemplate || step.body || '',
            skipIfReplied: step.skipIfReplied ?? true,
            skipIfClicked: step.skipIfClicked ?? false,
            skipIfOpened: step.skipIfOpened ?? false,
          })),
        });
      }
    }

    // Fetch updated sequence with steps
    const result = await prisma.sequence.findUnique({
      where: { id },
      include: {
        steps: {
          orderBy: { stepNumber: 'asc' },
        },
      },
    });

    logger.info('Updated sequence', { sequenceId: id, status: result?.status });

    return jsonResponse(result);
  },
  { requireAuth: true }
);

// DELETE /api/sequences/[id] - Delete a sequence
export const DELETE = createApiHandler(
  async (request: NextRequest, { logger, user, params }) => {
    const { id } = params;

    logger.debug('Deleting sequence', { sequenceId: id });

    // Verify sequence access
    const sequence = await prisma.sequence.findFirst({
      where: {
        id,
        ...(user.role !== 'ADMIN' ? { userId: user.id } : {}),
      },
    });

    if (!sequence) {
      throw Errors.notFound('Sequence');
    }

    // Don't allow deleting active sequences
    if (sequence.status === 'ACTIVE') {
      throw Errors.badRequest('Cannot delete an active sequence. Please pause it first.');
    }

    // Delete sequence (cascade will delete steps and leads)
    await prisma.sequence.delete({
      where: { id },
    });

    logger.info('Deleted sequence', { sequenceId: id });

    return jsonResponse({ success: true });
  },
  { requireAuth: true }
);
