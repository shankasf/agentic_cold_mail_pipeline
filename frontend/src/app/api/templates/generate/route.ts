import { NextRequest } from 'next/server';
import { aiClient } from '@/lib/ai-client';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  Errors,
  AppError,
} from '@/lib/api-utils';

interface TemplateGenerateBody {
  purpose: string;
  documentContent?: string;
  contextHints?: {
    industry?: string;
    company_type?: string;
    pain_points?: string[];
  };
}

// POST /api/templates/generate - Generate templates based on purpose
export const POST = createApiHandler(
  async (request: NextRequest, { logger }) => {
    const body = await parseJsonBody<TemplateGenerateBody>(request, logger);

    logger.debug('Generating templates', { purposeLength: body.purpose?.length });

    if (!body.purpose || body.purpose.trim().length < 5) {
      throw Errors.badRequest('Purpose is required and must be at least 5 characters', 'purpose');
    }

    // Check AI service health
    const isHealthy = await aiClient.healthCheck();
    if (!isHealthy) {
      throw new AppError(
        'AI service is not available. Please try again later.',
        'EXTERNAL_SERVICE_ERROR',
        503,
        { details: { service: 'ai-service' } }
      );
    }

    // Call AI service to generate templates
    const result = await aiClient.generateTemplates({
      purpose: body.purpose,
      documentContent: body.documentContent,
      contextHints: body.contextHints,
    });

    logger.info('Templates generated successfully');

    return jsonResponse(result);
  },
  { requireAuth: true }
);
