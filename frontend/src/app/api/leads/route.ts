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
    const { searchParams } = new URL(request.url);
    const { page, limit } = getPaginationParams(request);
    const type = searchParams.get('type') || 'opened'; // opened, clicked, replied
    const campaignId = searchParams.get('campaignId');
    const search = searchParams.get('search');

    const userFilter = await getUserFilter();

    logger.debug('Fetching leads', { type, campaignId, search, page, limit });

    // Build where clause for email events
    // Note: 'REPLY' is NOT an event type - replies are tracked via EmailDraft.status = 'REPLIED'
    const eventTypes: string[] = [];
    if (type === 'opened' || type === 'all') eventTypes.push('OPEN');
    if (type === 'clicked' || type === 'all') eventTypes.push('CLICK');

    const includeReplied = type === 'replied' || type === 'all';

    // Get unique contacts who have these events or replied
    // For 'replied' only type, we don't need event types, just check EmailDraft.status
    const leadsQuery = `
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
        COALESCE(ee.created_at, ed.updated_at) as last_event_at,
        (SELECT COUNT(*) FROM email_events e2
         JOIN email_drafts ed2 ON e2.email_draft_id = ed2.id
         WHERE ed2.contact_id = c.id AND e2.event_type = 'OPEN') as open_count,
        (SELECT COUNT(*) FROM email_events e3
         JOIN email_drafts ed3 ON e3.email_draft_id = ed3.id
         WHERE ed3.contact_id = c.id AND e3.event_type = 'CLICK') as click_count,
        (SELECT COUNT(*) FROM email_drafts ed4
         WHERE ed4.contact_id = c.id AND ed4.status = 'REPLIED') as reply_count
      FROM contacts c
      JOIN email_drafts ed ON ed.contact_id = c.id
      LEFT JOIN email_events ee ON ee.email_draft_id = ed.id
      JOIN businesses b ON c.business_id = b.id
      WHERE (
        ${eventTypes.length > 0 ? `ee.event_type IN (${eventTypes.map((_, i) => `$${i + 1}`).join(', ')})` : 'FALSE'}
        ${includeReplied ? `OR ed.status = 'REPLIED'` : ''}
      )
      ${userFilter?.userId ? `AND ed.user_id = $${eventTypes.length + 1}` : ''}
      ${campaignId ? `AND b.campaign_id = $${eventTypes.length + (userFilter?.userId ? 2 : 1)}` : ''}
      ${search ? `AND (c.email ILIKE $${eventTypes.length + (userFilter?.userId ? 1 : 0) + (campaignId ? 2 : 1)} OR c.name ILIKE $${eventTypes.length + (userFilter?.userId ? 1 : 0) + (campaignId ? 2 : 1)} OR b.canonical_name ILIKE $${eventTypes.length + (userFilter?.userId ? 1 : 0) + (campaignId ? 2 : 1)})` : ''}
      ORDER BY c.id, COALESCE(ee.created_at, ed.updated_at) DESC
    `;

    // Build params array
    const params: any[] = [...eventTypes];
    if (userFilter?.userId) params.push(userFilter.userId);
    if (campaignId) params.push(campaignId);
    if (search) params.push(`%${search}%`);

    // Get leads with raw query for complex aggregation
    const leads = await prisma.$queryRawUnsafe<any[]>(leadsQuery, ...params);

    // Get total count
    const countQuery = `
      SELECT COUNT(DISTINCT c.id) as total
      FROM contacts c
      JOIN email_drafts ed ON ed.contact_id = c.id
      LEFT JOIN email_events ee ON ee.email_draft_id = ed.id
      WHERE (
        ${eventTypes.length > 0 ? `ee.event_type IN (${eventTypes.map((_, i) => `$${i + 1}`).join(', ')})` : 'FALSE'}
        ${includeReplied ? `OR ed.status = 'REPLIED'` : ''}
      )
      ${userFilter?.userId ? `AND ed.user_id = $${eventTypes.length + 1}` : ''}
      ${campaignId ? `AND ed.business_id IN (SELECT id FROM businesses WHERE campaign_id = $${eventTypes.length + (userFilter?.userId ? 2 : 1)})` : ''}
    `;

    const countParams: any[] = [...eventTypes];
    if (userFilter?.userId) countParams.push(userFilter.userId);
    if (campaignId) countParams.push(campaignId);

    const countResult = await prisma.$queryRawUnsafe<{ total: bigint }[]>(countQuery, ...countParams);
    const total = Number(countResult[0]?.total || 0);

    // Paginate results
    const paginatedLeads = leads.slice((page - 1) * limit, page * limit);

    // Get summary metrics (with user filter applied)
    const metricsQuery = `
      SELECT
        COUNT(DISTINCT CASE WHEN ee.event_type = 'OPEN' THEN c.id END) as opened_count,
        COUNT(DISTINCT CASE WHEN ee.event_type = 'CLICK' THEN c.id END) as clicked_count,
        COUNT(DISTINCT CASE WHEN ed.status = 'REPLIED' THEN c.id END) as replied_count,
        COUNT(DISTINCT c.id) as total_engaged
      FROM contacts c
      JOIN email_drafts ed ON ed.contact_id = c.id
      LEFT JOIN email_events ee ON ee.email_draft_id = ed.id
      WHERE (ee.event_type IN ('OPEN', 'CLICK') OR ed.status = 'REPLIED')
      ${userFilter?.userId ? `AND ed.user_id = $1` : ''}
    `;

    const metricsParams: any[] = [];
    if (userFilter?.userId) metricsParams.push(userFilter.userId);

    const metrics = await prisma.$queryRawUnsafe<any[]>(metricsQuery, ...metricsParams);

    // Get total emails sent for rate calculation
    const sentCount = await prisma.emailDraft.count({
      where: { status: 'SENT', ...userFilter },
    });

    logger.info('Fetched leads', { type, total, paginatedCount: paginatedLeads.length });

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
        score: calculateLeadScore(
          Number(lead.open_count || 0),
          Number(lead.click_count || 0),
          Number(lead.reply_count || 0)
        ),
      })),
      metrics: {
        totalEngaged: Number(metrics[0]?.total_engaged || 0),
        opened: Number(metrics[0]?.opened_count || 0),
        clicked: Number(metrics[0]?.clicked_count || 0),
        replied: Number(metrics[0]?.replied_count || 0),
        totalSent: sentCount,
        openRate: sentCount > 0 ? ((Number(metrics[0]?.opened_count || 0) / sentCount) * 100).toFixed(1) : '0',
        clickRate: sentCount > 0 ? ((Number(metrics[0]?.clicked_count || 0) / sentCount) * 100).toFixed(1) : '0',
        replyRate: sentCount > 0 ? ((Number(metrics[0]?.replied_count || 0) / sentCount) * 100).toFixed(1) : '0',
      },
      pagination: buildPaginationMeta(total, page, limit),
    });
  },
  { requireAuth: true }
);
