import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import {
  verifyEmailIdentity,
  verifyDomainIdentity,
  getDomainVerificationStatus,
  deleteEmailIdentity,
  createConfigurationSet,
  deleteConfigurationSet,
} from '@/lib/ses';
import {
  createApiHandler,
  jsonResponse,
  parseJsonBody,
  Errors,
} from '@/lib/api-utils';

// GET /api/ses-identities - List all SES identities for current user
export const GET = createApiHandler(
  async (request: NextRequest, { logger, user }) => {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    logger.debug('Fetching SES identities', { status });

    const where: Record<string, unknown> = {};

    // Admins can see all identities, sales reps only see their own
    if (user.role !== 'ADMIN') {
      where.userId = user.id;
    }

    if (status) {
      where.status = status;
    }

    const identities = await prisma.sESIdentity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            emailDrafts: true,
            sequences: true,
          },
        },
      },
    });

    logger.debug('SES identities fetched', { count: identities.length });

    return jsonResponse({ identities });
  },
  { requireAuth: true }
);

// POST /api/ses-identities - Create a new SES identity (email or domain)
export const POST = createApiHandler(
  async (request: NextRequest, { logger, user }) => {
    const body = await parseJsonBody<{
      emailAddress?: string;
      displayName?: string;
    }>(request, logger);

    const { emailAddress, displayName } = body;

    if (!emailAddress) {
      throw Errors.badRequest('Email address or domain is required', 'emailAddress');
    }

    // Determine if this is a domain identity (starts with @) or email identity
    const isDomain = emailAddress.startsWith('@');
    const identityType = isDomain ? 'DOMAIN' : 'EMAIL';

    logger.debug('Creating SES identity', { emailAddress, identityType });

    // Validate format
    if (isDomain) {
      // Domain format: @domain.com
      const domainRegex = /^@[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}$/;
      if (!domainRegex.test(emailAddress)) {
        throw Errors.badRequest('Invalid domain format. Use @domain.com format.', 'emailAddress');
      }
    } else {
      // Email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailAddress)) {
        throw Errors.badRequest('Invalid email address format', 'emailAddress');
      }
    }

    // Check if identity already exists
    const existing = await prisma.sESIdentity.findUnique({
      where: { emailAddress },
    });

    if (existing) {
      throw Errors.conflict(
        isDomain ? 'This domain is already registered' : 'This email address is already registered',
        'emailAddress'
      );
    }

    // Create unique configuration set name
    const configSetName = `identity-${emailAddress.replace(/[@.]/g, '-')}-${Date.now()}`;

    // Verify in SES (different approach for domain vs email)
    let initialStatus: 'PENDING' | 'VERIFIED' = 'PENDING';
    let successMessage = '';
    let dkimTokens: string[] | undefined;
    let identityArn: string | undefined;

    if (isDomain) {
      // For domain: extract domain without @ and verify
      const domain = emailAddress.substring(1); // Remove leading @
      const verifyResult = await verifyDomainIdentity(domain);

      if (!verifyResult.success) {
        throw Errors.externalService('SES', verifyResult.error || 'Failed to verify domain in SES');
      }

      identityArn = verifyResult.identityArn;
      dkimTokens = verifyResult.dkimTokens;

      // Check if domain is already verified (may have been set up via DNS)
      const statusResult = await getDomainVerificationStatus(domain);
      if (statusResult.verified) {
        initialStatus = 'VERIFIED';
        successMessage = `Domain ${domain} is verified and ready to use for sending.`;
      } else {
        successMessage = `Domain ${domain} created. Please add the DNS records to verify the domain.`;
      }
    } else {
      const verifyResult = await verifyEmailIdentity(emailAddress);

      if (!verifyResult.success) {
        throw Errors.externalService('SES', verifyResult.error || 'Failed to verify email in SES');
      }

      identityArn = verifyResult.identityArn;
      successMessage = 'Verification email sent. Please check your inbox and click the verification link.';
    }

    // Create configuration set for tracking
    const configResult = await createConfigurationSet(configSetName);
    if (!configResult.success) {
      // Clean up: delete the identity we just created
      const identityToDelete = isDomain ? emailAddress.substring(1) : emailAddress;
      await deleteEmailIdentity(identityToDelete);
      throw Errors.externalService('SES', configResult.error || 'Failed to create configuration set');
    }

    // Create identity in database
    const identity = await prisma.sESIdentity.create({
      data: {
        userId: user.id,
        emailAddress,
        displayName: displayName || null,
        identityType,
        sesIdentityArn: identityArn,
        configSetName,
        status: initialStatus,
        warmupEnabled: false,
        dailyLimit: isDomain ? 1000 : 50, // Higher default limit for domains
        ...(initialStatus === 'VERIFIED' && { verifiedAt: new Date() }),
      },
    });

    logger.info('SES identity created', { identityId: identity.id, emailAddress, identityType });

    return jsonResponse({
      identity,
      message: successMessage,
      ...(isDomain && dkimTokens && { dkimTokens }),
    }, { status: 201 });
  },
  { requireAuth: true }
);

// DELETE /api/ses-identities - Delete an SES identity
export const DELETE = createApiHandler(
  async (request: NextRequest, { logger, user }) => {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      throw Errors.badRequest('Identity ID is required', 'id');
    }

    logger.debug('Deleting SES identity', { identityId: id });

    // Find the identity
    const identity = await prisma.sESIdentity.findUnique({
      where: { id },
    });

    if (!identity) {
      throw Errors.notFound('Identity');
    }

    // Check permission
    if (user.role !== 'ADMIN' && identity.userId !== user.id) {
      throw Errors.forbidden('You do not have permission to delete this identity');
    }

    // Delete from SES (use domain without @ for domain identities)
    const sesIdentity = identity.identityType === 'DOMAIN'
      ? identity.emailAddress.substring(1) // Remove leading @
      : identity.emailAddress;
    await deleteEmailIdentity(sesIdentity);

    // Delete configuration set
    if (identity.configSetName) {
      await deleteConfigurationSet(identity.configSetName);
    }

    // Delete from database
    await prisma.sESIdentity.delete({
      where: { id },
    });

    logger.info('SES identity deleted', { identityId: id, emailAddress: identity.emailAddress });

    return jsonResponse({ success: true });
  },
  { requireAuth: true }
);
