import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

export async function GET() {
  try {
    const response = await fetch(`${AI_SERVICE_URL}/chat/suggestions`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Suggestions API] AI Service error:', errorText);
      return NextResponse.json(
        { error: 'Failed to get suggestions from AI service' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[Suggestions API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
