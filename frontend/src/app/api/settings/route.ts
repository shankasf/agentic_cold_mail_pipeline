import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  Errors,
} from '@/lib/api-utils';

interface SettingsUpdateBody {
  businessAddress?: string;
  calendlyUrl?: string;
  confidenceThreshold?: number;
  deliverabilityThreshold?: number;
  maxWords?: number;
  sendingCapPerDay?: number;
}

// GET /api/settings - Get admin settings
export const GET = createApiHandler(
  async (request: NextRequest, { logger }) => {
    logger.debug('Fetching admin settings');

    let settings = await prisma.adminSettings.findFirst();

    if (!settings) {
      logger.info('No settings found, creating defaults');
      settings = await prisma.adminSettings.create({
        data: {},
      });
    }

    return jsonResponse(settings);
  },
  { requireAdmin: true }
);

// POST /api/settings - Update admin settings
export const POST = createApiHandler(
  async (request: NextRequest, { logger }) => {
    const body = await parseJsonBody<SettingsUpdateBody>(request, logger);

    logger.debug('Updating admin settings', { fields: Object.keys(body) });

    // Input validation
    if (body.confidenceThreshold !== undefined) {
      const threshold = Number(body.confidenceThreshold);
      if (isNaN(threshold) || threshold < 0 || threshold > 100) {
        throw Errors.badRequest('Confidence threshold must be between 0 and 100', 'confidenceThreshold');
      }
    }

    if (body.deliverabilityThreshold !== undefined) {
      const threshold = Number(body.deliverabilityThreshold);
      if (isNaN(threshold) || threshold < 0 || threshold > 100) {
        throw Errors.badRequest('Deliverability threshold must be between 0 and 100', 'deliverabilityThreshold');
      }
    }

    if (body.maxWords !== undefined) {
      const maxWords = Number(body.maxWords);
      if (isNaN(maxWords) || maxWords < 1 || maxWords > 10000) {
        throw Errors.badRequest('Max words must be between 1 and 10000', 'maxWords');
      }
    }

    if (body.sendingCapPerDay !== undefined) {
      const cap = Number(body.sendingCapPerDay);
      if (isNaN(cap) || cap < 0 || cap > 100000) {
        throw Errors.badRequest('Sending cap must be between 0 and 100000', 'sendingCapPerDay');
      }
    }

    if (body.calendlyUrl !== undefined && body.calendlyUrl !== null && body.calendlyUrl !== '') {
      try {
        new URL(body.calendlyUrl);
      } catch {
        throw Errors.badRequest('Calendly URL must be a valid URL', 'calendlyUrl');
      }
    }

    // Build update data with validated values
    const updateData: {
      businessAddress?: string;
      calendlyUrl?: string;
      confidenceThreshold?: number;
      deliverabilityThreshold?: number;
      maxWords?: number;
      sendingCapPerDay?: number;
    } = {};

    if (body.businessAddress !== undefined) updateData.businessAddress = String(body.businessAddress);
    if (body.calendlyUrl !== undefined) updateData.calendlyUrl = body.calendlyUrl || '';
    if (body.confidenceThreshold !== undefined) updateData.confidenceThreshold = Number(body.confidenceThreshold);
    if (body.deliverabilityThreshold !== undefined) updateData.deliverabilityThreshold = Number(body.deliverabilityThreshold);
    if (body.maxWords !== undefined) updateData.maxWords = Number(body.maxWords);
    if (body.sendingCapPerDay !== undefined) updateData.sendingCapPerDay = Number(body.sendingCapPerDay);

    let settings = await prisma.adminSettings.findFirst();

    if (settings) {
      settings = await prisma.adminSettings.update({
        where: { id: settings.id },
        data: updateData,
      });
      logger.info('Admin settings updated', { settingsId: settings.id });
    } else {
      settings = await prisma.adminSettings.create({
        data: updateData,
      });
      logger.info('Admin settings created', { settingsId: settings.id });
    }

    return jsonResponse(settings);
  },
  { requireAdmin: true }
);
