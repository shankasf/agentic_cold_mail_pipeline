import { NextRequest } from 'next/server';
import { authenticate, setAuthCookie } from '@/lib/auth';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  Errors,
} from '@/lib/api-utils';

interface LoginRequest {
  email: string;
  password: string;
}

export const POST = createApiHandler(async (request: NextRequest, { logger }) => {
  const body = await parseJsonBody<LoginRequest>(request, logger);
  const { email, password } = body;

  if (!email || !password) {
    throw Errors.badRequest('Email and password are required');
  }

  logger.debug('Login attempt', { email });

  // Verify email and password
  const result = await authenticate(email, password);

  if (!result.success || !result.user) {
    logger.info('Login failed', { email, reason: result.error });
    throw Errors.unauthorized(result.error || 'Invalid credentials');
  }

  // Set auth cookie with user info
  await setAuthCookie({
    id: result.user.id,
    email: result.user.email,
    role: result.user.role,
  });

  logger.info('Login successful', { userId: result.user.id, email });

  return jsonResponse({
    success: true,
    message: 'Login successful',
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: result.user.role,
    },
  });
});
