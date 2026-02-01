import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import prisma from '@/lib/prisma';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-super-secret-key-change-in-production'
);

export interface AuthUser {
  id: string;
  email: string;
  role: 'ADMIN' | 'SALES_REP';
  name: string | null;
}

/**
 * Get the current authenticated user from the auth cookie
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth-token')?.value;

    if (!token) {
      return null;
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);

    if (!payload.userId || payload.type === 'otp-session') {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId as string },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
      },
    });

    return user;
  } catch {
    return null;
  }
}

/**
 * Check if the current user is an admin
 */
export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === 'ADMIN';
}

/**
 * Get the user filter for queries - admins see all, users see their own data
 * @param userId - Optional user ID filter (for admin filtering by user)
 */
export async function getUserFilter(userIdParam?: string | null): Promise<{ userId?: string } | undefined> {
  const user = await getCurrentUser();

  if (!user) {
    // No user, return impossible filter
    return { userId: 'none' };
  }

  // Admin with specific user filter
  if (user.role === 'ADMIN' && userIdParam) {
    return { userId: userIdParam };
  }

  // Admin without filter sees all
  if (user.role === 'ADMIN') {
    return undefined; // No filter - sees all data
  }

  // Non-admin sees only their own data
  return { userId: user.id };
}

/**
 * Get user ID for creating new records
 */
export async function getUserIdForCreate(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.id || null;
}
