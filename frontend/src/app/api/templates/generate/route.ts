import { NextRequest, NextResponse } from 'next/server';
import { aiClient } from '@/lib/ai-client';

// POST /api/templates/generate - Generate templates based on purpose
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.purpose || body.purpose.trim().length < 5) {
      return NextResponse.json(
        { error: 'Purpose is required and must be at least 5 characters' },
        { status: 400 }
      );
    }

    // Check AI service health
    const isHealthy = await aiClient.healthCheck();
    if (!isHealthy) {
      return NextResponse.json(
        { error: 'AI service is not available. Please try again later.' },
        { status: 503 }
      );
    }

    // Call AI service to generate templates
    const result = await aiClient.generateTemplates({
      purpose: body.purpose,
      documentContent: body.documentContent,
      contextHints: body.contextHints,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error generating templates:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate templates' },
      { status: 500 }
    );
  }
}
