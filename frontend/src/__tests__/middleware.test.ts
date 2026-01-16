import { describe, it, expect } from 'vitest';

// Test the route matching logic used in middleware
describe('Middleware Route Matching', () => {
  const protectedRoutes = ['/dashboard'];
  const publicRoutes = ['/login', '/api/auth/login', '/api/auth/verify-otp'];
  const adminOnlyRoutes = ['/dashboard/users', '/dashboard/settings', '/api/users'];

  const isPublicRoute = (pathname: string) => {
    return publicRoutes.some((route) => pathname.startsWith(route));
  };

  const isProtectedRoute = (pathname: string) => {
    return protectedRoutes.some((route) => pathname.startsWith(route));
  };

  const isAdminOnlyRoute = (pathname: string) => {
    return adminOnlyRoutes.some((route) => pathname.startsWith(route));
  };

  describe('Public Routes', () => {
    it('should identify login page as public', () => {
      expect(isPublicRoute('/login')).toBe(true);
    });

    it('should identify login API as public', () => {
      expect(isPublicRoute('/api/auth/login')).toBe(true);
    });

    it('should identify verify-otp API as public', () => {
      expect(isPublicRoute('/api/auth/verify-otp')).toBe(true);
    });

    it('should not identify dashboard as public', () => {
      expect(isPublicRoute('/dashboard')).toBe(false);
    });
  });

  describe('Protected Routes', () => {
    it('should identify dashboard as protected', () => {
      expect(isProtectedRoute('/dashboard')).toBe(true);
    });

    it('should identify dashboard sub-pages as protected', () => {
      expect(isProtectedRoute('/dashboard/emails')).toBe(true);
      expect(isProtectedRoute('/dashboard/businesses')).toBe(true);
      expect(isProtectedRoute('/dashboard/users')).toBe(true);
    });

    it('should not identify login as protected', () => {
      expect(isProtectedRoute('/login')).toBe(false);
    });
  });

  describe('Admin-Only Routes', () => {
    it('should identify /dashboard/users as admin-only', () => {
      expect(isAdminOnlyRoute('/dashboard/users')).toBe(true);
    });

    it('should identify /dashboard/settings as admin-only', () => {
      expect(isAdminOnlyRoute('/dashboard/settings')).toBe(true);
    });

    it('should identify /api/users as admin-only', () => {
      expect(isAdminOnlyRoute('/api/users')).toBe(true);
    });

    it('should identify /api/users/[id] as admin-only', () => {
      expect(isAdminOnlyRoute('/api/users/123')).toBe(true);
    });

    it('should not identify /dashboard/emails as admin-only', () => {
      expect(isAdminOnlyRoute('/dashboard/emails')).toBe(false);
    });

    it('should not identify /dashboard/businesses as admin-only', () => {
      expect(isAdminOnlyRoute('/dashboard/businesses')).toBe(false);
    });
  });

  describe('Role-Based Access', () => {
    const checkAccess = (role: string, pathname: string) => {
      if (isAdminOnlyRoute(pathname) && role !== 'ADMIN') {
        return { allowed: false, redirect: '/dashboard' };
      }
      return { allowed: true };
    };

    it('should allow admin access to admin routes', () => {
      const result = checkAccess('ADMIN', '/dashboard/users');
      expect(result.allowed).toBe(true);
    });

    it('should deny sales rep access to admin routes', () => {
      const result = checkAccess('SALES_REP', '/dashboard/users');
      expect(result.allowed).toBe(false);
      expect(result.redirect).toBe('/dashboard');
    });

    it('should allow sales rep access to non-admin routes', () => {
      const result = checkAccess('SALES_REP', '/dashboard/emails');
      expect(result.allowed).toBe(true);
    });

    it('should allow admin access to non-admin routes', () => {
      const result = checkAccess('ADMIN', '/dashboard/emails');
      expect(result.allowed).toBe(true);
    });
  });
});
