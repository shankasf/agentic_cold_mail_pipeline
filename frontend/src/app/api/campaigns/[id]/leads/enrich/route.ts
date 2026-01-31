import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  Errors,
  HandlerContext,
} from '@/lib/api-utils';

interface EnrichmentRequest {
  leadIds: string[];
  prompt: string;
  sourceColumns: string[]; // Columns to use as input data
  outputColumn: string; // Column to store result
  createNewColumn?: boolean; // If output column doesn't exist, create it
  newColumnName?: string; // Display name for new column
  model?: string; // AI model to use (GPT or Claude)
}

const SYSTEM_PROMPT = `You are a research assistant helping to enrich lead data. Provide concise, factual responses.

Instructions:
- Provide a direct, concise answer
- Focus on factual, verifiable information
- If information cannot be found or determined, say "Not found" rather than making assumptions
- Keep response under 500 characters for data fields
- Do not include any explanations or caveats, just the direct answer`;

// Check if model is a Claude model
function isClaudeModel(model: string): boolean {
  return model.startsWith('claude');
}

// Call OpenAI API for enrichment
async function callOpenAIAPI(prompt: string, context: Record<string, unknown>, model: string = 'gpt-5.2'): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw Errors.badRequest('OPENAI_API_KEY not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 1024,
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: `Lead Data:
${JSON.stringify(context, null, 2)}

Research Request:
${prompt}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw Errors.externalService('OpenAI', error);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'No response';
}

// Call Anthropic Claude API for enrichment
async function callClaudeAPI(prompt: string, context: Record<string, unknown>, model: string = 'claude-sonnet-4-5-20251101'): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw Errors.badRequest('ANTHROPIC_API_KEY not configured');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Lead Data:
${JSON.stringify(context, null, 2)}

Research Request:
${prompt}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw Errors.externalService('Claude', error);
  }

  const data = await response.json();
  return data.content?.[0]?.text || 'No response';
}

// Unified API call function
async function callAI(prompt: string, context: Record<string, unknown>, model: string): Promise<string> {
  if (isClaudeModel(model)) {
    return callClaudeAPI(prompt, context, model);
  }
  return callOpenAIAPI(prompt, context, model);
}

// POST /api/campaigns/[id]/leads/enrich - AI enrichment for leads
export const POST = createApiHandler(
  async (request: NextRequest, { logger, user, params }: HandlerContext) => {
    const campaignId = params.id;
    const body = await parseJsonBody<EnrichmentRequest>(request, logger);

    const { leadIds, prompt, sourceColumns, outputColumn, createNewColumn, newColumnName, model = 'claude-sonnet-4-5-20251101' } = body;

    if (!leadIds || leadIds.length === 0) {
      throw Errors.badRequest('leadIds array is required', 'leadIds');
    }

    if (!prompt) {
      throw Errors.badRequest('Prompt is required', 'prompt');
    }

    if (!outputColumn) {
      throw Errors.badRequest('Output column is required', 'outputColumn');
    }

    logger.debug('Enriching leads', { campaignId, leadCount: leadIds.length, model });

    // Verify campaign access
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        ...(user.role !== 'ADMIN' ? { userId: user.id } : {}),
      },
    });

    if (!campaign) {
      throw Errors.notFound('Campaign');
    }

    // Get or create output column
    let column = await prisma.leadColumn.findUnique({
      where: {
        campaignId_key: {
          campaignId,
          key: outputColumn,
        },
      },
    });

    if (!column && createNewColumn) {
      const maxOrder = await prisma.leadColumn.aggregate({
        where: { campaignId },
        _max: { orderIndex: true },
      });

      column = await prisma.leadColumn.create({
        data: {
          campaignId,
          name: newColumnName || outputColumn,
          key: outputColumn,
          type: 'text',
          isEnriched: true,
          orderIndex: (maxOrder._max.orderIndex || 0) + 1,
        },
      });
    }

    // Build where clause for user access
    const whereBase: Record<string, unknown> = {
      id: { in: leadIds },
      campaignId,
    };

    if (user.role !== 'ADMIN') {
      whereBase.userId = user.id;
    }

    // Fetch leads
    const leads = await prisma.lead.findMany({
      where: whereBase as Prisma.LeadWhereInput,
    });

    if (leads.length === 0) {
      throw Errors.notFound('Leads');
    }

    // Process each lead
    const results: Array<{ leadId: string; success: boolean; result?: string; error?: string }> = [];

    for (const lead of leads) {
      try {
        // Build context from source columns
        const context: Record<string, unknown> = {
          email: lead.email,
          firstName: lead.firstName,
          lastName: lead.lastName,
          company: lead.company,
          title: lead.title,
          phone: lead.phone,
          linkedinUrl: lead.linkedinUrl,
          website: lead.website,
          location: lead.location,
          industry: lead.industry,
          ...(lead.customColumns as object || {}),
        };

        // Filter to only requested columns
        const inputData: Record<string, unknown> = {};
        if (sourceColumns && sourceColumns.length > 0) {
          for (const col of sourceColumns) {
            if (context[col] !== undefined && context[col] !== null && context[col] !== '') {
              inputData[col] = context[col];
            }
          }
        } else {
          // Use all available data
          for (const [key, value] of Object.entries(context)) {
            if (value !== undefined && value !== null && value !== '') {
              inputData[key] = value;
            }
          }
        }

        // Create the prompt with variable substitution
        let finalPrompt = prompt;
        for (const [key, value] of Object.entries(inputData)) {
          finalPrompt = finalPrompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'gi'), String(value));
        }

        // Call AI API (OpenAI or Claude based on model)
        const result = await callAI(finalPrompt, inputData, model);

        // Update lead with enrichment result
        const updatedCustomColumns = {
          ...(lead.customColumns as object || {}),
          [outputColumn]: result,
        };

        const updatedEnrichmentData = {
          ...(lead.enrichmentData as object || {}),
          [outputColumn]: {
            prompt: finalPrompt,
            result,
            timestamp: new Date().toISOString(),
          },
        };

        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            customColumns: updatedCustomColumns,
            enrichmentData: updatedEnrichmentData,
            lastEnrichedAt: new Date(),
          },
        });

        results.push({
          leadId: lead.id,
          success: true,
          result,
        });
      } catch (err) {
        results.push({
          leadId: lead.id,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    logger.info('Lead enrichment completed', { processed: leads.length, successful, failed });

    return jsonResponse({
      success: true,
      processed: leads.length,
      successful,
      failed,
      results,
      column: column || { key: outputColumn, name: newColumnName || outputColumn },
    });
  },
  { requireAuth: true }
);

// GET /api/campaigns/[id]/leads/enrich - Get enrichment status/preview
export const GET = createApiHandler(
  async (request: NextRequest, { logger, user, params }: HandlerContext) => {
    const campaignId = params.id;
    const searchParams = request.nextUrl.searchParams;
    const leadId = searchParams.get('leadId');
    const prompt = searchParams.get('prompt');
    const sourceColumns = searchParams.get('sourceColumns')?.split(',').filter(Boolean) || [];
    const model = searchParams.get('model') || 'claude-sonnet-4-5-20251101';

    if (!leadId || !prompt) {
      throw Errors.badRequest('leadId and prompt are required');
    }

    logger.debug('Generating enrichment preview', { campaignId, leadId, model });

    // Verify campaign access
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        ...(user.role !== 'ADMIN' ? { userId: user.id } : {}),
      },
    });

    if (!campaign) {
      throw Errors.notFound('Campaign');
    }

    // Build where clause for user access
    const whereBase: Record<string, unknown> = {
      id: leadId,
      campaignId,
    };

    if (user.role !== 'ADMIN') {
      whereBase.userId = user.id;
    }

    // Fetch lead
    const lead = await prisma.lead.findFirst({
      where: whereBase as Prisma.LeadWhereInput,
    });

    if (!lead) {
      throw Errors.notFound('Lead');
    }

    // Build context
    const context: Record<string, unknown> = {
      email: lead.email,
      firstName: lead.firstName,
      lastName: lead.lastName,
      company: lead.company,
      title: lead.title,
      phone: lead.phone,
      linkedinUrl: lead.linkedinUrl,
      website: lead.website,
      location: lead.location,
      industry: lead.industry,
      ...(lead.customColumns as object || {}),
    };

    // Filter to only requested columns
    const inputData: Record<string, unknown> = {};
    if (sourceColumns.length > 0) {
      for (const col of sourceColumns) {
        if (context[col] !== undefined && context[col] !== null && context[col] !== '') {
          inputData[col] = context[col];
        }
      }
    } else {
      for (const [key, value] of Object.entries(context)) {
        if (value !== undefined && value !== null && value !== '') {
          inputData[key] = value;
        }
      }
    }

    // Create the preview prompt
    let finalPrompt = prompt;
    for (const [key, value] of Object.entries(inputData)) {
      finalPrompt = finalPrompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'gi'), String(value));
    }

    // Generate test output using AI (OpenAI or Claude based on model)
    const result = await callAI(finalPrompt, inputData, model);

    logger.debug('Preview generated', { leadId });

    return jsonResponse({
      preview: {
        inputData,
        prompt: finalPrompt,
        result,
      },
    });
  },
  { requireAuth: true }
);
