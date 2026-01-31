import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, validatePassword } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { createApiHandler, jsonResponse, parseJsonBody, Errors } from '@/lib/api-utils';

// GET - Get single user (Admin only)
export const GET = createApiHandler(
  async (request: NextRequest, { logger, params }) => {
    const { id } = params;

    logger.debug('Fetching user', { userId: id });

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw Errors.notFound('User');
    }

    logger.info('User fetched', { userId: id });

    return jsonResponse({ user });
  },
  { requireAdmin: true }
);

// PATCH - Update user (Admin only)
export const PATCH = createApiHandler(
  async (request: NextRequest, { logger, user: currentUser, params }) => {
    const { id } = params;
    const body = await parseJsonBody<{
      email?: string;
      password?: string;
      name?: string;
      role?: UserRole;
      isActive?: boolean;
    }>(request, logger);

    logger.debug('Updating user', { userId: id });

    // Check if target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!targetUser) {
      throw Errors.notFound('User');
    }

    const { email, password, name, role, isActive } = body;

    // Prevent admin from demoting themselves
    if (id === currentUser.id && role && role !== 'ADMIN') {
      throw Errors.badRequest('Cannot demote yourself from admin role');
    }

    // Prevent admin from deactivating themselves
    if (id === currentUser.id && isActive === false) {
      throw Errors.badRequest('Cannot deactivate your own account');
    }

    // Build update data
    const updateData: {
      email?: string;
      passwordHash?: string;
      name?: string | null;
      role?: UserRole;
      isActive?: boolean;
    } = {};

    // Validate and set email
    if (email !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw Errors.validation('Invalid email format', 'email');
      }

      // Check if email is already used by another user
      const existingUser = await prisma.user.findFirst({
        where: {
          email: email.toLowerCase(),
          id: { not: id },
        },
      });

      if (existingUser) {
        throw Errors.conflict('Email already in use by another user', 'email');
      }

      updateData.email = email.toLowerCase();
    }

    // Validate and set password
    if (password) {
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.valid) {
        throw Errors.validation(passwordValidation.error || 'Invalid password', 'password');
      }
      updateData.passwordHash = await hashPassword(password);
    }

    // Set name
    if (name !== undefined) {
      updateData.name = name || null;
    }

    // Validate and set role
    if (role !== undefined) {
      const validRoles: UserRole[] = ['ADMIN', 'SALES_REP'];
      if (!validRoles.includes(role)) {
        throw Errors.validation('Invalid role', 'role');
      }
      updateData.role = role;
    }

    // Set isActive
    if (isActive !== undefined) {
      updateData.isActive = Boolean(isActive);
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    logger.info('User updated', { userId: id });

    return jsonResponse({
      user: updatedUser,
      message: 'User updated successfully',
    });
  },
  { requireAdmin: true }
);

// DELETE - Delete user (Admin only)
export const DELETE = createApiHandler(
  async (request: NextRequest, { logger, user: currentUser, params }) => {
    const { id } = params;

    logger.debug('Deleting user', { userId: id });

    // Prevent admin from deleting themselves
    if (id === currentUser.id) {
      throw Errors.badRequest('Cannot delete your own account');
    }

    // Check if target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!targetUser) {
      throw Errors.notFound('User');
    }

    // Delete user
    await prisma.user.delete({
      where: { id },
    });

    logger.info('User deleted', { userId: id });

    return jsonResponse({
      message: 'User deleted successfully',
    });
  },
  { requireAdmin: true }
);
