/**
 * API Route Utilities
 *
 * Provides:
 * - createApiHandler wrapper with auto-auth, logging, error handling
 * - Request ID injection and header management
 * - Consistent JSON response formatting
 */

import { NextRequest, NextResponse } from 'next/server';
import { Logger, createRequestLogger, logRequestComplete, generateRequestId } from './logger';
import { handleError, Errors, AppError } from './errors';
import { getCurrentUser, AuthUser, isAdmin } from './auth-utils';

/**
 * Handler context provided to API handlers
 */
export interface HandlerContext {
  /** Structured logger with request context */
  logger: Logger;
  /** Unique request ID for correlation */
  requestId: string;
  /** Authenticated user (if requireAuth is true) */
  user: AuthUser;
  /** Route parameters (for dynamic routes) */
  params: Record<string, string>;
}

/**
 * Partial context for handlers that don't require auth
 */
export interface OptionalAuthContext {
  logger: Logger;
  requestId: string;
  user: AuthUser | null;
  params: Record<string, string>;
}

/**
 * API handler function type with required auth
 */
export type ApiHandler<T = unknown> = (
  request: NextRequest,
  context: HandlerContext
) => Promise<NextResponse<T>>;

/**
 * API handler function type with optional auth
 */
export type OptionalAuthHandler<T = unknown> = (
  request: NextRequest,
  context: OptionalAuthContext
) => Promise<NextResponse<T>>;

/**
 * Options for createApiHandler
 */
export interface ApiHandlerOptions {
  /** Require authentication (default: false) */
  requireAuth?: boolean;
  /** Require admin role (implies requireAuth) */
  requireAdmin?: boolean;
}

/**
 * Response data wrapper for consistent formatting
 */
export interface SuccessResponse<T> {
  data: T;
}

/**
 * Create a JSON response with proper headers
 */
export function jsonResponse<T>(
  data: T,
  options?: {
    status?: number;
    requestId?: string;
    headers?: HeadersInit;
    cache?: string;
  }
): NextResponse<T> {
  const headers: Record<string, string> = {};

  if (options?.requestId) {
    headers['X-Request-Id'] = options.requestId;
  }

  if (options?.cache) {
    headers['Cache-Control'] = options.cache;
  }

  // Merge additional headers
  if (options?.headers) {
    const additionalHeaders =
      options.headers instanceof Headers
        ? Object.fromEntries(options.headers.entries())
        : options.headers;
    Object.assign(headers, additionalHeaders);
  }

  return NextResponse.json(data, {
    status: options?.status ?? 200,
    headers,
  });
}

/**
 * Parse route params from Next.js dynamic route context
 */
async function parseParams(
  routeContext?: { params?: Promise<Record<string, string>> | Record<string, string> }
): Promise<Record<string, string>> {
  if (!routeContext?.params) return {};

  // Handle both Promise and plain object params (Next.js 15 uses Promise)
  const params = routeContext.params;
  if (params instanceof Promise) {
    return await params;
  }
  return params;
}

/**
 * Create an API handler with automatic:
 * - Request logging
 * - Error handling
 * - Authentication (optional)
 * - Request ID generation
 * - Response timing
 *
 * @example
 * // Authenticated route
 * export const GET = createApiHandler(
 *   async (request, { logger, user }) => {
 *     logger.debug('Fetching data');
 *     const data = await fetchData(user.id);
 *     return jsonResponse({ data });
 *   },
 *   { requireAuth: true }
 * );
 *
 * @example
 * // Admin-only route
 * export const POST = createApiHandler(
 *   async (request, { logger, user }) => {
 *     logger.info('Admin action', { adminId: user.id });
 *     return jsonResponse({ success: true });
 *   },
 *   { requireAdmin: true }
 * );
 *
 * @example
 * // Public route with optional auth
 * export const GET = createApiHandler(
 *   async (request, { logger, user }) => {
 *     const data = await fetchPublicData();
 *     return jsonResponse({ data, isAuthenticated: !!user });
 *   }
 * );
 */
export function createApiHandler<T = unknown>(
  handler: ApiHandler<T>,
  options: ApiHandlerOptions & { requireAuth: true }
): (
  request: NextRequest,
  context?: { params?: Promise<Record<string, string>> | Record<string, string> }
) => Promise<NextResponse>;

export function createApiHandler<T = unknown>(
  handler: ApiHandler<T>,
  options: ApiHandlerOptions & { requireAdmin: true }
): (
  request: NextRequest,
  context?: { params?: Promise<Record<string, string>> | Record<string, string> }
) => Promise<NextResponse>;

export function createApiHandler<T = unknown>(
  handler: OptionalAuthHandler<T>,
  options?: ApiHandlerOptions
): (
  request: NextRequest,
  context?: { params?: Promise<Record<string, string>> | Record<string, string> }
) => Promise<NextResponse>;

export function createApiHandler<T = unknown>(
  handler: ApiHandler<T> | OptionalAuthHandler<T>,
  options: ApiHandlerOptions = {}
): (
  request: NextRequest,
  context?: { params?: Promise<Record<string, string>> | Record<string, string> }
) => Promise<NextResponse> {
  const requireAuth = options.requireAuth || options.requireAdmin;
  const requireAdmin = options.requireAdmin;

  return async (
    request: NextRequest,
    routeContext?: { params?: Promise<Record<string, string>> | Record<string, string> }
  ): Promise<NextResponse> => {
    const startTime = Date.now();
    const requestId = generateRequestId();

    // Create initial logger (will be updated with user context)
    let logger = createRequestLogger(request, null);
    logger = logger.child({ requestId });

    try {
      // Parse route params
      const params = await parseParams(routeContext);

      // Get current user
      const user = await getCurrentUser();

      // Update logger with user context
      if (user) {
        logger = logger.child({ userId: user.id });
      }

      // Check authentication
      if (requireAuth && !user) {
        throw Errors.unauthorized();
      }

      // Check admin role
      if (requireAdmin && user?.role !== 'ADMIN') {
        throw Errors.forbidden('Admin access required');
      }

      // Build handler context
      const context = {
        logger,
        requestId,
        user: user as AuthUser,
        params,
      };

      // Execute handler
      const response = await (handler as OptionalAuthHandler<T>)(request, context);

      // Add request ID header to successful responses
      if (!response.headers.has('X-Request-Id')) {
        response.headers.set('X-Request-Id', requestId);
      }

      // Log completion
      logRequestComplete(logger, response.status, startTime);

      return response;
    } catch (error) {
      // Handle errors consistently
      const errorResponse = handleError(error, logger);

      // Log completion
      logRequestComplete(logger, errorResponse.status, startTime);

      return errorResponse;
    }
  };
}

/**
 * Parse and validate JSON body from request
 */
export async function parseJsonBody<T = unknown>(
  request: NextRequest,
  logger?: Logger
): Promise<T> {
  try {
    const body = await request.json();
    return body as T;
  } catch (error) {
    logger?.warn('Failed to parse JSON body', { error: String(error) });
    throw Errors.badRequest('Invalid JSON body');
  }
}

/**
 * Get search params as an object
 */
export function getSearchParams(request: NextRequest): Record<string, string> {
  const params: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

/**
 * Parse pagination params from search params
 */
export function getPaginationParams(
  request: NextRequest,
  defaults: { page?: number; limit?: number; maxLimit?: number } = {}
): { page: number; limit: number; skip: number } {
  const { page: defaultPage = 1, limit: defaultLimit = 20, maxLimit = 100 } = defaults;

  const pageParam = request.nextUrl.searchParams.get('page');
  const limitParam = request.nextUrl.searchParams.get('limit');

  const page = Math.max(1, parseInt(pageParam || String(defaultPage), 10) || defaultPage);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(limitParam || String(defaultLimit), 10) || defaultLimit));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

/**
 * Build pagination response metadata
 */
export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number
): {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
} {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

// Re-export commonly used items for convenience
export { Errors, AppError } from './errors';
export type { AuthUser } from './auth-utils';
