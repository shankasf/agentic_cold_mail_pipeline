import { NextResponse } from 'next/server';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, conversation_id } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    const response = await fetch(`${AI_SERVICE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        conversation_id,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Chat API] AI Service error:', errorText);
      return NextResponse.json(
        { error: 'Failed to get response from AI service' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[Chat API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
