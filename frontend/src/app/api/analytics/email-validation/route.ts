import { createApiHandler, jsonResponse } from '@/lib/api-utils';
import prisma from '@/lib/prisma';
import { getUserFilter } from '@/lib/auth-utils';

// GET /api/analytics/email-validation - Get email validation metrics
export const GET = createApiHandler(
  async (request, { logger }) => {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('campaignId');
    const userFilter = await getUserFilter();

    logger.debug('Fetching email validation metrics', { campaignId });

    // Build where clause for contacts
    const businessWhere: Record<string, unknown> = { ...userFilter };
    if (campaignId) {
      businessWhere.campaignId = campaignId;
    }

    // Get validation status counts
    const validationStats = await prisma.contact.groupBy({
      by: ['validationStatus'],
      where: {
        business: businessWhere,
      },
      _count: true,
    });

    // Calculate totals
    const totalContacts = validationStats.reduce((sum, s) => sum + s._count, 0);
    const validEmails = validationStats.find(s => s.validationStatus === 'VALID')?._count || 0;
    const invalidEmails = validationStats.find(s => s.validationStatus === 'INVALID')?._count || 0;
    const riskyEmails = validationStats.find(s => s.validationStatus === 'RISKY')?._count || 0;
    const blockedEmails = validationStats.find(s => s.validationStatus === 'BLOCKED')?._count || 0;
    const pendingValidation = validationStats.find(s => s.validationStatus === 'PENDING')?._count || 0;

    // Calculate rates
    const validationRate = totalContacts > 0 ? ((validEmails + riskyEmails) / totalContacts) * 100 : 0;
    const invalidRate = totalContacts > 0 ? (invalidEmails / totalContacts) * 100 : 0;
    const riskyRate = totalContacts > 0 ? (riskyEmails / totalContacts) * 100 : 0;

    // Get validation details breakdown
    const contactsWithDetails = await prisma.contact.findMany({
      where: {
        business: businessWhere,
        emailValidated: true,
      },
      select: {
        validationDetails: true,
      },
    });

    // Aggregate validation issues
    let formatIssues = 0;
    let mxIssues = 0;
    let disposableEmails = 0;
    let roleAccountEmails = 0;

    contactsWithDetails.forEach(contact => {
      const details = contact.validationDetails as Record<string, unknown> | null;
      if (details) {
        if (details.formatValid === false) formatIssues++;
        if (details.mxValid === false) mxIssues++;
        if (details.isDisposable === true) disposableEmails++;
        if (details.isRoleAccount === true) roleAccountEmails++;
      }
    });

    // Get per-campaign stats if not filtered by campaign
    let campaignStats: Array<{
      id: string;
      name: string;
      totalContacts: number;
      validEmails: number;
      invalidEmails: number;
      riskyEmails: number;
      validationRate: number;
    }> = [];

    if (!campaignId) {
      const campaigns = await prisma.campaign.findMany({
        where: userFilter,
        select: {
          id: true,
          name: true,
          totalContacts: true,
          validEmails: true,
          invalidEmails: true,
          riskyEmails: true,
          validationRate: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      campaignStats = campaigns;
    }

    logger.info('Email validation metrics fetched', {
      totalContacts,
      validEmails,
      invalidEmails,
      validationRate: validationRate.toFixed(1),
    });

    return jsonResponse({
      summary: {
        totalContacts,
        validEmails,
        invalidEmails,
        riskyEmails,
        blockedEmails,
        pendingValidation,
        validationRate: Math.round(validationRate * 100) / 100,
        invalidRate: Math.round(invalidRate * 100) / 100,
        riskyRate: Math.round(riskyRate * 100) / 100,
      },
      issues: {
        formatIssues,
        mxIssues,
        disposableEmails,
        roleAccountEmails,
      },
      campaignStats,
    });
  },
  { requireAuth: true }
);
