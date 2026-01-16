import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-super-secret-key-change-in-production'
);

// Routes that require authentication
const protectedRoutes = ['/dashboard'];

// Routes that are public
const publicRoutes = ['/login', '/forgot-password', '/api/auth/login', '/api/auth/verify-otp', '/api/auth/forgot-password'];

// Admin-only routes
const adminOnlyRoutes = ['/dashboard/users', '/dashboard/settings', '/api/users'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Check if route needs protection
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));

  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  // Get auth token from cookie
  const token = request.cookies.get('auth-token')?.value;

  if (!token) {
    // Redirect to login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Verify token
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);

    // Check if it's a valid auth token (not OTP session)
    if (payload.type === 'otp-session') {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }

    // Check for admin-only routes
    const isAdminOnlyRoute = adminOnlyRoutes.some(route => pathname.startsWith(route));
    if (isAdminOnlyRoute && payload.role !== 'ADMIN') {
      // Redirect non-admins to dashboard
      const dashboardUrl = new URL('/dashboard', request.url);
      return NextResponse.redirect(dashboardUrl);
    }

    // Token is valid, allow request
    return NextResponse.next();
  } catch (error) {
    // Token is invalid or expired
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);

    // Clear invalid cookie
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete('auth-token');
    return response;
  }
}

export const config = {
  matcher: [
    // Match all routes except static files and api routes that don't need auth
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|api/webhooks).*)',
  ],
};
