import { clearAuthCookie } from '@/lib/auth';
import { createApiHandler, jsonResponse } from '@/lib/api-utils';

export const POST = createApiHandler(async (_request, { logger }) => {
  await clearAuthCookie();

  logger.info('User logged out');

  return jsonResponse({
    success: true,
    message: 'Logged out successfully',
  });
});
