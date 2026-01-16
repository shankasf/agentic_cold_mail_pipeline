import { NextRequest, NextResponse } from 'next/server';
import { authenticate, setAuthCookie } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Verify email and password
    const result = await authenticate(email, password);

    if (!result.success || !result.user) {
      return NextResponse.json(
        { error: result.error || 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Set auth cookie with user info
    await setAuthCookie({
      id: result.user.id,
      email: result.user.email,
      role: result.user.role,
    });

    return NextResponse.json({
      success: true,
      message: 'Login successful',
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}
