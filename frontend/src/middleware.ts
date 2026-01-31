import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify, JWTPayload } from 'jose';

// Edge-compatible logging (can't import logger.ts due to Node.js deps)
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
  if (envLevel && LOG_LEVEL_PRIORITY[envLevel] !== undefined) {
    return envLevel;
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[getLogLevel()];
}

function generateRequestId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

function middlewareLog(
  level: LogLevel,
  message: string,
  context: Record<string, unknown> = {}
): void {
  if (!shouldLog(level)) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context: { ...context, component: 'middleware' },
    service: process.env.SERVICE_NAME || 'email-marketing-frontend',
  };

  const output = JSON.stringify(entry);
  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-super-secret-key-change-in-production'
);

// In-memory token cache for Edge runtime (1 hour TTL)
const TOKEN_CACHE_TTL = 60 * 60 * 1000; // 1 hour in ms
const TOKEN_CACHE_MAX_SIZE = 1000;
const tokenCache = new Map<string, { payload: JWTPayload; expiresAt: number }>();

// Simple hash function for cache key (faster than crypto in Edge)
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

// Clean expired entries periodically
function cleanCache() {
  const now = Date.now();
  for (const [key, value] of tokenCache.entries()) {
    if (value.expiresAt < now) {
      tokenCache.delete(key);
    }
  }
  // If still too large, remove oldest entries
  if (tokenCache.size > TOKEN_CACHE_MAX_SIZE) {
    const entriesToRemove = tokenCache.size - TOKEN_CACHE_MAX_SIZE;
    const keys = tokenCache.keys();
    for (let i = 0; i < entriesToRemove; i++) {
      const key = keys.next().value;
      if (key) tokenCache.delete(key);
    }
  }
}

// Routes that require authentication
const protectedRoutes = ['/dashboard'];

// Routes that are public (expanded to include more static/API paths)
const publicRoutes = [
  '/login',
  '/forgot-password',
  '/api/auth/login',
  '/api/auth/verify-otp',
  '/api/auth/forgot-password',
  '/api/webhooks',
];

// Admin-only routes
const adminOnlyRoutes = ['/dashboard/users', '/dashboard/settings', '/api/users'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = generateRequestId();

  // Fast path: Skip middleware for static assets and public API routes
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/webhooks') ||
    pathname.includes('.') // Static files like .ico, .svg, etc.
  ) {
    const response = NextResponse.next();
    response.headers.set('X-Request-Id', requestId);
    return response;
  }

  // Allow public routes
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    const response = NextResponse.next();
    response.headers.set('X-Request-Id', requestId);
    return response;
  }

  // Check if route needs protection
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));

  if (!isProtectedRoute) {
    const response = NextResponse.next();
    response.headers.set('X-Request-Id', requestId);
    return response;
  }

  // Get auth token from cookie
  const token = request.cookies.get('auth-token')?.value;

  if (!token) {
    middlewareLog('warn', 'Auth required - no token', {
      requestId,
      pathname,
      reason: 'missing_token',
    });

    // Redirect to login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    const response = NextResponse.redirect(loginUrl);
    response.headers.set('X-Request-Id', requestId);
    return response;
  }

  // Check cache first
  const cacheKey = simpleHash(token);
  const cached = tokenCache.get(cacheKey);
  const now = Date.now();

  let payload: JWTPayload;

  if (cached && cached.expiresAt > now) {
    // Cache hit - use cached payload
    payload = cached.payload;
    middlewareLog('debug', 'Auth token cache hit', {
      requestId,
      pathname,
      userId: payload.userId,
    });
  } else {
    // Cache miss - verify token
    try {
      const result = await jwtVerify(token, JWT_SECRET);
      payload = result.payload;

      middlewareLog('debug', 'Auth token verified', {
        requestId,
        pathname,
        userId: payload.userId,
      });

      // Cache the verified token
      tokenCache.set(cacheKey, {
        payload,
        expiresAt: now + TOKEN_CACHE_TTL,
      });

      // Periodic cleanup (1% chance per request to avoid overhead)
      if (Math.random() < 0.01) {
        cleanCache();
      }
    } catch {
      middlewareLog('warn', 'Auth failed - invalid token', {
        requestId,
        pathname,
        reason: 'invalid_token',
      });

      // Token is invalid or expired
      tokenCache.delete(cacheKey);
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);

      // Clear invalid cookie
      const response = NextResponse.redirect(loginUrl);
      response.cookies.delete('auth-token');
      response.headers.set('X-Request-Id', requestId);
      return response;
    }
  }

  // Check if it's a valid auth token (not OTP session)
  if (payload.type === 'otp-session') {
    middlewareLog('warn', 'Auth failed - OTP session token', {
      requestId,
      pathname,
      reason: 'otp_session',
    });

    const loginUrl = new URL('/login', request.url);
    const response = NextResponse.redirect(loginUrl);
    response.headers.set('X-Request-Id', requestId);
    return response;
  }

  // Check for admin-only routes
  const isAdminOnlyRoute = adminOnlyRoutes.some(route => pathname.startsWith(route));
  if (isAdminOnlyRoute && payload.role !== 'ADMIN') {
    middlewareLog('warn', 'Auth failed - admin required', {
      requestId,
      pathname,
      userId: payload.userId,
      role: payload.role,
      reason: 'insufficient_role',
    });

    // Redirect non-admins to dashboard
    const dashboardUrl = new URL('/dashboard', request.url);
    const response = NextResponse.redirect(dashboardUrl);
    response.headers.set('X-Request-Id', requestId);
    return response;
  }

  // Token is valid, allow request
  middlewareLog('debug', 'Auth success', {
    requestId,
    pathname,
    userId: payload.userId,
    role: payload.role,
  });

  const response = NextResponse.next();
  response.headers.set('X-Request-Id', requestId);
  return response;
}

export const config = {
  matcher: [
    // Match all routes except static files and api routes that don't need auth
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|api/webhooks).*)',
  ],
};
