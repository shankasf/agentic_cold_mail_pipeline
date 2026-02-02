import prisma from './prisma';

/**
 * Calculate validation score based on email metrics
 * Score: 0-100, higher is better
 */
function calculateValidationScore(metrics: {
  totalSent: number;
  totalDelivered: number;
  totalBounced: number;
  totalComplaints: number;
}): number {
  if (metrics.totalSent === 0) return 100;

  const deliveryRate = metrics.totalDelivered / metrics.totalSent;
  const bounceRate = metrics.totalBounced / metrics.totalSent;
  const complaintRate = metrics.totalComplaints / metrics.totalSent;

  let score = 100;

  // Deduct for low delivery rate (max 30 points)
  if (deliveryRate < 0.9) score -= 30;
  else if (deliveryRate < 0.95) score -= 15;
  else if (deliveryRate < 0.98) score -= 5;

  // Deduct for bounce rate (max 40 points)
  if (bounceRate > 0.1) score -= 40;
  else if (bounceRate > 0.05) score -= 25;
  else if (bounceRate > 0.02) score -= 10;

  // Deduct for complaint rate (max 30 points - complaints are serious)
  if (complaintRate > 0.01) score -= 30;
  else if (complaintRate > 0.005) score -= 20;
  else if (complaintRate > 0.001) score -= 10;

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate rates from metrics
 */
function calculateRates(metrics: {
  totalSent: number;
  totalDelivered: number;
  totalOpened: number;
  totalClicked: number;
  totalReplied: number;
  totalBounced: number;
  totalComplaints: number;
}) {
  const deliveryRate = metrics.totalSent > 0 ? metrics.totalDelivered / metrics.totalSent : 0;
  const openRate = metrics.totalDelivered > 0 ? metrics.totalOpened / metrics.totalDelivered : 0;
  const clickRate = metrics.totalDelivered > 0 ? metrics.totalClicked / metrics.totalDelivered : 0;
  const replyRate = metrics.totalDelivered > 0 ? metrics.totalReplied / metrics.totalDelivered : 0;
  const bounceRate = metrics.totalSent > 0 ? metrics.totalBounced / metrics.totalSent : 0;
  const complaintRate = metrics.totalSent > 0 ? metrics.totalComplaints / metrics.totalSent : 0;

  return {
    deliveryRate: Math.round(deliveryRate * 10000) / 10000,
    openRate: Math.round(openRate * 10000) / 10000,
    clickRate: Math.round(clickRate * 10000) / 10000,
    replyRate: Math.round(replyRate * 10000) / 10000,
    bounceRate: Math.round(bounceRate * 10000) / 10000,
    complaintRate: Math.round(complaintRate * 10000) / 10000,
  };
}

/**
 * Track a successful email send for a business
 * Called when an email is marked as SENT
 */
export async function trackEmailSent(businessId: string, contactEmail: string): Promise<void> {
  try {
    await prisma.validatedEmailBusiness.upsert({
      where: { businessId },
      create: {
        businessId,
        totalEmailsSent: 1,
        lastValidatedEmail: contactEmail,
        isValidated: false, // Not validated until delivered
        validationScore: 50, // Initial score
      },
      update: {
        totalEmailsSent: { increment: 1 },
        lastValidatedEmail: contactEmail,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error('[ValidatedEmailTracker] Error tracking email sent:', error);
  }
}

/**
 * Track a successful email delivery for a business
 * Called when a DELIVERED event is received
 */
export async function trackEmailDelivered(businessId: string, contactEmail: string): Promise<void> {
  try {
    const existing = await prisma.validatedEmailBusiness.findUnique({
      where: { businessId },
    });

    const now = new Date();

    if (existing) {
      const newMetrics = {
        totalSent: existing.totalEmailsSent,
        totalDelivered: existing.totalDelivered + 1,
        totalOpened: existing.totalOpened,
        totalClicked: existing.totalClicked,
        totalReplied: existing.totalReplied,
        totalBounced: existing.totalBounced,
        totalComplaints: existing.totalComplaints,
      };

      const rates = calculateRates(newMetrics);
      const score = calculateValidationScore(newMetrics);

      await prisma.validatedEmailBusiness.update({
        where: { businessId },
        data: {
          totalDelivered: { increment: 1 },
          lastValidatedAt: now,
          lastValidatedEmail: contactEmail,
          isValidated: true,
          validationScore: score,
          ...rates,
        },
      });
    } else {
      // Create new record if email was delivered without tracking send
      await prisma.validatedEmailBusiness.create({
        data: {
          businessId,
          totalEmailsSent: 1,
          totalDelivered: 1,
          firstValidatedAt: now,
          lastValidatedAt: now,
          lastValidatedEmail: contactEmail,
          isValidated: true,
          validationScore: 100,
          deliveryRate: 1,
        },
      });
    }
  } catch (error) {
    console.error('[ValidatedEmailTracker] Error tracking email delivered:', error);
  }
}

/**
 * Track email opened event
 */
export async function trackEmailOpened(businessId: string): Promise<void> {
  try {
    const existing = await prisma.validatedEmailBusiness.findUnique({
      where: { businessId },
    });

    if (existing) {
      const newMetrics = {
        totalSent: existing.totalEmailsSent,
        totalDelivered: existing.totalDelivered,
        totalOpened: existing.totalOpened + 1,
        totalClicked: existing.totalClicked,
        totalReplied: existing.totalReplied,
        totalBounced: existing.totalBounced,
        totalComplaints: existing.totalComplaints,
      };

      const rates = calculateRates(newMetrics);

      await prisma.validatedEmailBusiness.update({
        where: { businessId },
        data: {
          totalOpened: { increment: 1 },
          ...rates,
        },
      });
    }
  } catch (error) {
    console.error('[ValidatedEmailTracker] Error tracking email opened:', error);
  }
}

/**
 * Track email clicked event
 */
export async function trackEmailClicked(businessId: string): Promise<void> {
  try {
    const existing = await prisma.validatedEmailBusiness.findUnique({
      where: { businessId },
    });

    if (existing) {
      const newMetrics = {
        totalSent: existing.totalEmailsSent,
        totalDelivered: existing.totalDelivered,
        totalOpened: existing.totalOpened,
        totalClicked: existing.totalClicked + 1,
        totalReplied: existing.totalReplied,
        totalBounced: existing.totalBounced,
        totalComplaints: existing.totalComplaints,
      };

      const rates = calculateRates(newMetrics);

      await prisma.validatedEmailBusiness.update({
        where: { businessId },
        data: {
          totalClicked: { increment: 1 },
          ...rates,
        },
      });
    }
  } catch (error) {
    console.error('[ValidatedEmailTracker] Error tracking email clicked:', error);
  }
}

/**
 * Track email replied event
 */
export async function trackEmailReplied(businessId: string): Promise<void> {
  try {
    const existing = await prisma.validatedEmailBusiness.findUnique({
      where: { businessId },
    });

    if (existing) {
      const newMetrics = {
        totalSent: existing.totalEmailsSent,
        totalDelivered: existing.totalDelivered,
        totalOpened: existing.totalOpened,
        totalClicked: existing.totalClicked,
        totalReplied: existing.totalReplied + 1,
        totalBounced: existing.totalBounced,
        totalComplaints: existing.totalComplaints,
      };

      const rates = calculateRates(newMetrics);

      await prisma.validatedEmailBusiness.update({
        where: { businessId },
        data: {
          totalReplied: { increment: 1 },
          ...rates,
        },
      });
    }
  } catch (error) {
    console.error('[ValidatedEmailTracker] Error tracking email replied:', error);
  }
}

/**
 * Track email bounced event
 */
export async function trackEmailBounced(businessId: string): Promise<void> {
  try {
    const existing = await prisma.validatedEmailBusiness.findUnique({
      where: { businessId },
    });

    if (existing) {
      const newMetrics = {
        totalSent: existing.totalEmailsSent,
        totalDelivered: existing.totalDelivered,
        totalOpened: existing.totalOpened,
        totalClicked: existing.totalClicked,
        totalReplied: existing.totalReplied,
        totalBounced: existing.totalBounced + 1,
        totalComplaints: existing.totalComplaints,
      };

      const rates = calculateRates(newMetrics);
      const score = calculateValidationScore(newMetrics);

      // Mark as not validated if bounce rate is too high
      const isValidated = newMetrics.totalBounced / newMetrics.totalSent < 0.1;

      await prisma.validatedEmailBusiness.update({
        where: { businessId },
        data: {
          totalBounced: { increment: 1 },
          isValidated,
          validationScore: score,
          ...rates,
        },
      });
    }
  } catch (error) {
    console.error('[ValidatedEmailTracker] Error tracking email bounced:', error);
  }
}

/**
 * Track email complaint event
 */
export async function trackEmailComplaint(businessId: string): Promise<void> {
  try {
    const existing = await prisma.validatedEmailBusiness.findUnique({
      where: { businessId },
    });

    if (existing) {
      const newMetrics = {
        totalSent: existing.totalEmailsSent,
        totalDelivered: existing.totalDelivered,
        totalOpened: existing.totalOpened,
        totalClicked: existing.totalClicked,
        totalReplied: existing.totalReplied,
        totalBounced: existing.totalBounced,
        totalComplaints: existing.totalComplaints + 1,
      };

      const rates = calculateRates(newMetrics);
      const score = calculateValidationScore(newMetrics);

      // Mark as not validated if complaint rate is too high
      const isValidated = newMetrics.totalComplaints / newMetrics.totalSent < 0.01;

      await prisma.validatedEmailBusiness.update({
        where: { businessId },
        data: {
          totalComplaints: { increment: 1 },
          isValidated,
          validationScore: score,
          ...rates,
        },
      });
    }
  } catch (error) {
    console.error('[ValidatedEmailTracker] Error tracking email complaint:', error);
  }
}

/**
 * Recalculate metrics for a business from email events
 * Useful for fixing data inconsistencies or initial backfill
 */
export async function recalculateBusinessMetrics(businessId: string): Promise<void> {
  try {
    // Get all email drafts for this business with their events
    const emailDrafts = await prisma.emailDraft.findMany({
      where: { businessId },
      include: {
        events: true,
        contact: { select: { email: true } },
      },
    });

    const metrics = {
      totalSent: 0,
      totalDelivered: 0,
      totalOpened: 0,
      totalClicked: 0,
      totalReplied: 0,
      totalBounced: 0,
      totalComplaints: 0,
    };

    let firstValidatedAt: Date | null = null;
    let lastValidatedAt: Date | null = null;
    let lastValidatedEmail: string | null = null;

    for (const draft of emailDrafts) {
      const hasEvent = (type: string) => draft.events.some(e => e.eventType === type);
      const getEventDate = (type: string) => draft.events.find(e => e.eventType === type)?.createdAt;

      if (draft.status === 'SENT' || hasEvent('SENT')) {
        metrics.totalSent++;
      }

      if (hasEvent('DELIVERED')) {
        metrics.totalDelivered++;
        const deliveredAt = getEventDate('DELIVERED');
        if (deliveredAt) {
          if (!firstValidatedAt || deliveredAt < firstValidatedAt) {
            firstValidatedAt = deliveredAt;
          }
          if (!lastValidatedAt || deliveredAt > lastValidatedAt) {
            lastValidatedAt = deliveredAt;
            lastValidatedEmail = draft.contact.email;
          }
        }
      }

      if (hasEvent('OPEN')) metrics.totalOpened++;
      if (hasEvent('CLICK')) metrics.totalClicked++;
      if (hasEvent('REPLY') || draft.status === 'REPLIED') metrics.totalReplied++;
      if (hasEvent('BOUNCE') || draft.status === 'BOUNCED') metrics.totalBounced++;
      if (hasEvent('COMPLAINT') || draft.status === 'COMPLAINT') metrics.totalComplaints++;
    }

    // Only create/update if we have sent emails
    if (metrics.totalSent === 0) return;

    const rates = calculateRates(metrics);
    const score = calculateValidationScore(metrics);
    const isValidated = metrics.totalDelivered > 0 &&
      metrics.totalBounced / metrics.totalSent < 0.1 &&
      metrics.totalComplaints / metrics.totalSent < 0.01;

    await prisma.validatedEmailBusiness.upsert({
      where: { businessId },
      create: {
        businessId,
        totalEmailsSent: metrics.totalSent,
        totalDelivered: metrics.totalDelivered,
        totalOpened: metrics.totalOpened,
        totalClicked: metrics.totalClicked,
        totalReplied: metrics.totalReplied,
        totalBounced: metrics.totalBounced,
        totalComplaints: metrics.totalComplaints,
        firstValidatedAt: firstValidatedAt || new Date(),
        lastValidatedAt: lastValidatedAt || new Date(),
        lastValidatedEmail,
        isValidated,
        validationScore: score,
        ...rates,
      },
      update: {
        totalEmailsSent: metrics.totalSent,
        totalDelivered: metrics.totalDelivered,
        totalOpened: metrics.totalOpened,
        totalClicked: metrics.totalClicked,
        totalReplied: metrics.totalReplied,
        totalBounced: metrics.totalBounced,
        totalComplaints: metrics.totalComplaints,
        firstValidatedAt: firstValidatedAt || undefined,
        lastValidatedAt: lastValidatedAt || undefined,
        lastValidatedEmail,
        isValidated,
        validationScore: score,
        ...rates,
      },
    });
  } catch (error) {
    console.error('[ValidatedEmailTracker] Error recalculating business metrics:', error);
  }
}

/**
 * Backfill validated email businesses from existing data
 * Run this once to populate the table with historical data
 */
export async function backfillValidatedEmailBusinesses(): Promise<{
  processed: number;
  validated: number;
  errors: number;
}> {
  const result = { processed: 0, validated: 0, errors: 0 };

  try {
    // Get all businesses that have email drafts
    const businessIds = await prisma.emailDraft.findMany({
      where: {
        status: { in: ['SENT', 'REPLIED', 'BOUNCED', 'COMPLAINT'] },
      },
      select: { businessId: true },
      distinct: ['businessId'],
    });

    console.log(`[Backfill] Found ${businessIds.length} businesses with sent emails`);

    for (const { businessId } of businessIds) {
      try {
        await recalculateBusinessMetrics(businessId);
        result.processed++;

        // Check if validated
        const record = await prisma.validatedEmailBusiness.findUnique({
          where: { businessId },
        });
        if (record?.isValidated) {
          result.validated++;
        }
      } catch (error) {
        console.error(`[Backfill] Error processing business ${businessId}:`, error);
        result.errors++;
      }
    }

    console.log(`[Backfill] Complete: ${result.processed} processed, ${result.validated} validated, ${result.errors} errors`);
  } catch (error) {
    console.error('[Backfill] Error:', error);
  }

  return result;
}

/**
 * Get validated email statistics summary
 */
export async function getValidatedEmailStats(): Promise<{
  totalBusinesses: number;
  validatedBusinesses: number;
  avgDeliveryRate: number;
  avgOpenRate: number;
  avgReplyRate: number;
  topPerformers: Array<{
    businessId: string;
    validationScore: number;
    totalDelivered: number;
  }>;
}> {
  const [total, validated, avgStats, topPerformers] = await Promise.all([
    prisma.validatedEmailBusiness.count(),
    prisma.validatedEmailBusiness.count({ where: { isValidated: true } }),
    prisma.validatedEmailBusiness.aggregate({
      _avg: {
        deliveryRate: true,
        openRate: true,
        replyRate: true,
      },
    }),
    prisma.validatedEmailBusiness.findMany({
      where: { isValidated: true },
      orderBy: { validationScore: 'desc' },
      take: 10,
      select: {
        businessId: true,
        validationScore: true,
        totalDelivered: true,
      },
    }),
  ]);

  return {
    totalBusinesses: total,
    validatedBusinesses: validated,
    avgDeliveryRate: avgStats._avg.deliveryRate || 0,
    avgOpenRate: avgStats._avg.openRate || 0,
    avgReplyRate: avgStats._avg.replyRate || 0,
    topPerformers,
  };
}
