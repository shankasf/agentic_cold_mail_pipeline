import { createApiHandler, jsonResponse, Errors } from '@/lib/api-utils';

export const GET = createApiHandler(async (_request, { logger, user }) => {
  if (!user) {
    logger.debug('Auth check - no authenticated user');
    throw Errors.unauthorized();
  }

  logger.debug('Auth check - user authenticated', { userId: user.id });

  return jsonResponse({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
});
