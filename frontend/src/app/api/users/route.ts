import { prisma } from '@/lib/prisma';
import { hashPassword, validatePassword, getCurrentUser } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { sendNotificationEmail } from '@/lib/email-sender';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  Errors,
} from '@/lib/api-utils';

// GET - List all users (Admin only)
export const GET = createApiHandler(
  async (_request, { logger }) => {
    logger.debug('Fetching all users');

    const users = await prisma.user.findMany({
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
      orderBy: { createdAt: 'desc' },
    });

    logger.info('Users fetched successfully', { count: users.length });
    return jsonResponse({ users });
  },
  { requireAdmin: true }
);

// POST - Create new user (Admin only)
export const POST = createApiHandler(
  async (request, { logger, user: adminUser }) => {
    const body = await parseJsonBody<{
      email?: string;
      password?: string;
      name?: string;
      role?: UserRole;
    }>(request, logger);

    const { email, password, name, role } = body;

    // Validate required fields
    if (!email || !password) {
      throw Errors.badRequest('Email and password are required');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw Errors.badRequest('Invalid email format', 'email');
    }

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      throw Errors.badRequest(passwordValidation.error || 'Invalid password', 'password');
    }

    // Validate role
    const validRoles: UserRole[] = ['ADMIN', 'SALES_REP'];
    const userRole = role && validRoles.includes(role) ? role : 'SALES_REP';

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      throw Errors.conflict('Email already exists', 'email');
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    logger.debug('Creating new user', { email: email.toLowerCase(), role: userRole });

    // Create user
    const newUser = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        name: name || null,
        role: userRole,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    // Get admin who created the user
    const currentUser = await getCurrentUser();
    const adminEmail = currentUser?.email || 'admin@callsphere.tech';
    const adminName = currentUser?.name || 'Admin';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://marketing.callsphere.tech';

    // Send welcome email to new user
    const userEmailBody = `Hi ${name || 'there'},

Welcome to CallSphere! Your account has been created successfully.

Here are your login details:
- Email: ${email.toLowerCase()}
- Password: ${password}

You can login at: ${appUrl}/login

Please change your password after your first login for security.

If you have any questions, please contact your administrator.

Best regards,
The CallSphere Team`;

    await sendNotificationEmail({
      to: email.toLowerCase(),
      subject: 'Welcome to CallSphere - Your Account is Ready',
      bodyText: userEmailBody,
    });

    // Send notification email to admin
    const adminEmailBody = `Hi ${adminName},

A new user has been added to CallSphere.

New User Details:
- Name: ${name || 'Not provided'}
- Email: ${email.toLowerCase()}
- Role: ${userRole}
- Created: ${new Date().toLocaleString()}

The user has been sent a welcome email with their login credentials.

Best regards,
CallSphere System`;

    await sendNotificationEmail({
      to: adminEmail,
      subject: `New User Created: ${name || email}`,
      bodyText: adminEmailBody,
    });

    logger.info('User created successfully', { userId: newUser.id, createdBy: adminUser.id });

    return jsonResponse(
      { user: newUser, message: 'User created successfully. Confirmation emails sent.' },
      { status: 201 }
    );
  },
  { requireAdmin: true }
);
