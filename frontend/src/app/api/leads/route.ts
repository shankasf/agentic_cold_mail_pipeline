import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFilter } from '@/lib/auth-utils';
import {
  createApiHandler,
  jsonResponse,
  getPaginationParams,
  buildPaginationMeta,
} from '@/lib/api-utils';

// Calculate lead score based on engagement
function calculateLeadScore(opens: number, clicks: number, replies: number): number {
  // Scoring: Reply = 50pts, Click = 30pts, Open = 10pts (max 100)
  const score = Math.min(100, (replies * 50) + (clicks * 30) + (opens * 10));
  return score;
}

// GET /api/leads - Get leads (contacts who engaged with emails)
export const GET = createApiHandler(
  async (request: NextRequest, { logger }) => {
    const { searchParams } = request.nextUrl;
    const { page, limit } = getPaginationParams(request);
    const type = searchParams.get('type') || 'all';
    const campaignId = searchParams.get('campaignId');
    const search = searchParams.get('search');
    const scoreFilter = searchParams.get('score'); // hot, warm, cool, cold
    const industry = searchParams.get('industry');
    const dateRange = searchParams.get('dateRange'); // today, 7days, 30days, 90days, all
    const minOpens = searchParams.get('minOpens');
    const minClicks = searchParams.get('minClicks');
    const minReplies = searchParams.get('minReplies');

    const userFilter = await getUserFilter();

    logger.debug('Fetching leads', { type, campaignId, search, scoreFilter, industry, dateRange, page, limit });

    // Build conditions based on type
    const includeOpened = type === 'opened' || type === 'all';
    const includeClicked = type === 'clicked' || type === 'all';
    const includeReplied = type === 'replied' || type === 'all';

    // Build parameterized query parts
    const params: unknown[] = [];
    let paramIndex = 1;

    // Build event type condition
    // Note: event_type is an enum, so we need to cast the text parameter to the enum type
    const eventConditions: string[] = [];
    if (includeOpened) {
      eventConditions.push(`ee.event_type = $${paramIndex++}::"EmailEventType"`);
      params.push('OPEN');
    }
    if (includeClicked) {
      eventConditions.push(`ee.event_type = $${paramIndex++}::"EmailEventType"`);
      params.push('CLICK');
    }
    if (includeReplied) {
      eventConditions.push(`ed.status = 'REPLIED'`);
    }

    const eventConditionStr = eventConditions.length > 0
      ? `(${eventConditions.join(' OR ')})`
      : 'FALSE';

    // Build additional WHERE conditions
    const whereConditions: string[] = [eventConditionStr];

    if (userFilter?.userId) {
      whereConditions.push(`ed.user_id = $${paramIndex++}`);
      params.push(userFilter.userId);
    }

    if (campaignId) {
      whereConditions.push(`b.campaign_id = $${paramIndex++}`);
      params.push(campaignId);
    }

    if (search) {
      whereConditions.push(`(c.email ILIKE $${paramIndex} OR c.name ILIKE $${paramIndex} OR b.canonical_name ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (industry) {
      whereConditions.push(`b.industry_guess = $${paramIndex++}`);
      params.push(industry);
    }

    // Date range filter
    if (dateRange && dateRange !== 'all') {
      let daysAgo = 0;
      switch (dateRange) {
        case 'today': daysAgo = 1; break;
        case '7days': daysAgo = 7; break;
        case '30days': daysAgo = 30; break;
        case '90days': daysAgo = 90; break;
      }
      if (daysAgo > 0) {
        whereConditions.push(`COALESCE(ee.created_at, ed.updated_at) >= NOW() - INTERVAL '${daysAgo} days'`);
      }
    }

    const whereClause = whereConditions.join(' AND ');

    // Main query to get leads with engagement data
    const leadsQuery = `
      WITH lead_data AS (
        SELECT DISTINCT ON (c.id)
          c.id as contact_id,
          c.email,
          c.name as contact_name,
          c.role,
          b.id as business_id,
          b.canonical_name as company,
          b.industry_guess as industry,
          b.website,
          ed.id as last_email_id,
          ed.subject as last_subject,
          COALESCE(ee.event_type::text, CASE WHEN ed.status = 'REPLIED' THEN 'REPLY' END) as last_event_type,
          COALESCE(ee.created_at, ed.updated_at) as last_event_at
        FROM contacts c
        JOIN businesses b ON c.business_id = b.id
        JOIN email_drafts ed ON ed.contact_id = c.id
        LEFT JOIN email_events ee ON ee.email_draft_id = ed.id
        WHERE ${whereClause}
        ORDER BY c.id, COALESCE(ee.created_at, ed.updated_at) DESC
      ),
      lead_counts AS (
        SELECT
          ld.contact_id,
          ld.email,
          ld.contact_name,
          ld.role,
          ld.business_id,
          ld.company,
          ld.industry,
          ld.website,
          ld.last_email_id,
          ld.last_subject,
          ld.last_event_type,
          ld.last_event_at,
          (SELECT COUNT(*) FROM email_events e2
           JOIN email_drafts ed2 ON e2.email_draft_id = ed2.id
           WHERE ed2.contact_id = ld.contact_id AND e2.event_type = 'OPEN'::"EmailEventType") as open_count,
          (SELECT COUNT(*) FROM email_events e3
           JOIN email_drafts ed3 ON e3.email_draft_id = ed3.id
           WHERE ed3.contact_id = ld.contact_id AND e3.event_type = 'CLICK'::"EmailEventType") as click_count,
          (SELECT COUNT(*) FROM email_drafts ed4
           WHERE ed4.contact_id = ld.contact_id AND ed4.status = 'REPLIED') as reply_count
        FROM lead_data ld
      )
      SELECT * FROM lead_counts
      ORDER BY last_event_at DESC
    `;

    // Execute the query
    const allLeads = await prisma.$queryRawUnsafe<Array<{
      contact_id: string;
      email: string;
      contact_name: string | null;
      role: string | null;
      business_id: string;
      company: string;
      industry: string | null;
      website: string | null;
      last_email_id: string;
      last_subject: string;
      last_event_type: string;
      last_event_at: Date;
      open_count: bigint;
      click_count: bigint;
      reply_count: bigint;
    }>>(leadsQuery, ...params);

    // Apply post-query filters (score and min engagement)
    let filteredLeads = allLeads.map(lead => ({
      ...lead,
      score: calculateLeadScore(
        Number(lead.open_count || 0),
        Number(lead.click_count || 0),
        Number(lead.reply_count || 0)
      ),
    }));

    // Score filter
    if (scoreFilter) {
      filteredLeads = filteredLeads.filter(lead => {
        switch (scoreFilter) {
          case 'hot': return lead.score >= 80;
          case 'warm': return lead.score >= 50 && lead.score < 80;
          case 'cool': return lead.score >= 20 && lead.score < 50;
          case 'cold': return lead.score < 20;
          default: return true;
        }
      });
    }

    // Min engagement filters
    if (minOpens) {
      const min = parseInt(minOpens, 10);
      if (!isNaN(min)) filteredLeads = filteredLeads.filter(lead => Number(lead.open_count) >= min);
    }
    if (minClicks) {
      const min = parseInt(minClicks, 10);
      if (!isNaN(min)) filteredLeads = filteredLeads.filter(lead => Number(lead.click_count) >= min);
    }
    if (minReplies) {
      const min = parseInt(minReplies, 10);
      if (!isNaN(min)) filteredLeads = filteredLeads.filter(lead => Number(lead.reply_count) >= min);
    }

    const total = filteredLeads.length;

    // Paginate in memory (since we need all for counting anyway)
    const paginatedLeads = filteredLeads.slice((page - 1) * limit, page * limit);

    // Build metrics query params
    const metricsParams: unknown[] = [];
    let metricsParamIndex = 1;
    const metricsConditions: string[] = [];

    if (userFilter?.userId) {
      metricsConditions.push(`ed.user_id = $${metricsParamIndex++}`);
      metricsParams.push(userFilter.userId);
    }

    const metricsWhereClause = metricsConditions.length > 0
      ? `WHERE ${metricsConditions.join(' AND ')}`
      : '';

    // Get summary metrics
    const metricsQuery = `
      SELECT
        COUNT(DISTINCT CASE WHEN ee.event_type = 'OPEN'::"EmailEventType" THEN c.id END) as opened_count,
        COUNT(DISTINCT CASE WHEN ee.event_type = 'CLICK'::"EmailEventType" THEN c.id END) as clicked_count,
        COUNT(DISTINCT CASE WHEN ed.status = 'REPLIED' THEN c.id END) as replied_count,
        COUNT(DISTINCT CASE WHEN ee.event_type IN ('OPEN'::"EmailEventType", 'CLICK'::"EmailEventType") OR ed.status = 'REPLIED' THEN c.id END) as total_engaged
      FROM contacts c
      JOIN email_drafts ed ON ed.contact_id = c.id
      LEFT JOIN email_events ee ON ee.email_draft_id = ed.id
      ${metricsWhereClause}
    `;

    const metrics = await prisma.$queryRawUnsafe<Array<{
      opened_count: bigint;
      clicked_count: bigint;
      replied_count: bigint;
      total_engaged: bigint;
    }>>(metricsQuery, ...metricsParams);

    // Get total emails sent for rate calculation
    const sentCount = await prisma.emailDraft.count({
      where: {
        status: { in: ['SENT', 'REPLIED', 'BOUNCED', 'COMPLAINT'] },
        ...userFilter
      },
    });

    logger.info('Fetched leads', { type, total, paginatedCount: paginatedLeads.length });

    const openedCount = Number(metrics[0]?.opened_count || 0);
    const clickedCount = Number(metrics[0]?.clicked_count || 0);
    const repliedCount = Number(metrics[0]?.replied_count || 0);
    const totalEngaged = Number(metrics[0]?.total_engaged || 0);

    // Get unique industries for filter dropdown
    const industriesResult = await prisma.business.findMany({
      where: {
        industryGuess: { not: null },
        contacts: {
          some: {
            emailDrafts: {
              some: {
                ...userFilter,
              },
            },
          },
        },
      },
      select: { industryGuess: true },
      distinct: ['industryGuess'],
    });
    const industries = industriesResult
      .map(b => b.industryGuess)
      .filter((i): i is string => i !== null)
      .sort();

    // Get campaigns for filter dropdown
    const campaigns = await prisma.campaign.findMany({
      where: userFilter,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    return jsonResponse({
      leads: paginatedLeads.map(lead => ({
        contactId: lead.contact_id,
        email: lead.email,
        contactName: lead.contact_name,
        role: lead.role,
        businessId: lead.business_id,
        company: lead.company,
        industry: lead.industry,
        website: lead.website,
        lastEmailId: lead.last_email_id,
        lastSubject: lead.last_subject,
        lastEventType: lead.last_event_type,
        lastEventAt: lead.last_event_at,
        openCount: Number(lead.open_count || 0),
        clickCount: Number(lead.click_count || 0),
        replyCount: Number(lead.reply_count || 0),
        score: lead.score,
      })),
      metrics: {
        totalEngaged,
        opened: openedCount,
        clicked: clickedCount,
        replied: repliedCount,
        totalSent: sentCount,
        openRate: sentCount > 0 ? ((openedCount / sentCount) * 100).toFixed(1) : '0',
        clickRate: sentCount > 0 ? ((clickedCount / sentCount) * 100).toFixed(1) : '0',
        replyRate: sentCount > 0 ? ((repliedCount / sentCount) * 100).toFixed(1) : '0',
      },
      pagination: buildPaginationMeta(total, page, limit),
      filterOptions: {
        industries,
        campaigns,
      },
    });
  },
  { requireAuth: true }
);
