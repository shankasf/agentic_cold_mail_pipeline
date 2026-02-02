"""
Analytics tools for querying email performance metrics.
"""

from agents import function_tool
from ..db import fetch_one, fetch_all


@function_tool
async def get_analytics_summary(days: int = 7) -> dict:
    """Get email analytics summary for the specified period.

    Args:
        days: Number of days to analyze (default 7)

    Returns:
        Analytics summary including total_sent, total_delivered, total_opened,
        total_clicked, total_replied, total_bounced, total_complaints,
        delivery_rate, open_rate, click_rate, reply_rate, bounce_rate, complaint_rate
    """
    query = """
    WITH email_stats AS (
        SELECT
            COUNT(*) FILTER (WHERE e.status IN ('SENT', 'REPLIED', 'BOUNCED', 'COMPLAINT')) as total_sent,
            COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM email_events ev
                WHERE ev.email_draft_id = e.id AND ev.event_type = 'DELIVERED'
            )) as total_delivered,
            COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM email_events ev
                WHERE ev.email_draft_id = e.id AND ev.event_type = 'OPEN'
            )) as total_opened,
            COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM email_events ev
                WHERE ev.email_draft_id = e.id AND ev.event_type = 'CLICK'
            )) as total_clicked,
            COUNT(*) FILTER (WHERE e.status = 'REPLIED') as total_replied,
            COUNT(*) FILTER (WHERE e.status = 'BOUNCED') as total_bounced,
            COUNT(*) FILTER (WHERE e.status = 'COMPLAINT') as total_complaints
        FROM email_drafts e
        WHERE e.sent_at >= NOW() - ($1 || ' days')::interval
    )
    SELECT
        total_sent,
        total_delivered,
        total_opened,
        total_clicked,
        total_replied,
        total_bounced,
        total_complaints,
        CASE WHEN total_sent > 0 THEN ROUND(100.0 * total_delivered / total_sent, 2) ELSE 0 END as delivery_rate,
        CASE WHEN total_delivered > 0 THEN ROUND(100.0 * total_opened / total_delivered, 2) ELSE 0 END as open_rate,
        CASE WHEN total_delivered > 0 THEN ROUND(100.0 * total_clicked / total_delivered, 2) ELSE 0 END as click_rate,
        CASE WHEN total_delivered > 0 THEN ROUND(100.0 * total_replied / total_delivered, 2) ELSE 0 END as reply_rate,
        CASE WHEN total_sent > 0 THEN ROUND(100.0 * total_bounced / total_sent, 2) ELSE 0 END as bounce_rate,
        CASE WHEN total_sent > 0 THEN ROUND(100.0 * total_complaints / total_sent, 2) ELSE 0 END as complaint_rate
    FROM email_stats
    """
    result = await fetch_one(query, str(days))
    if result:
        return {
            "period_days": days,
            "total_sent": result["total_sent"] or 0,
            "total_delivered": result["total_delivered"] or 0,
            "total_opened": result["total_opened"] or 0,
            "total_clicked": result["total_clicked"] or 0,
            "total_replied": result["total_replied"] or 0,
            "total_bounced": result["total_bounced"] or 0,
            "total_complaints": result["total_complaints"] or 0,
            "delivery_rate": float(result["delivery_rate"] or 0),
            "open_rate": float(result["open_rate"] or 0),
            "click_rate": float(result["click_rate"] or 0),
            "reply_rate": float(result["reply_rate"] or 0),
            "bounce_rate": float(result["bounce_rate"] or 0),
            "complaint_rate": float(result["complaint_rate"] or 0),
        }
    return {"period_days": days, "error": "No data found"}


@function_tool
async def get_identity_performance(limit: int = 10) -> list[dict]:
    """Get performance metrics for each SES sending identity.

    Args:
        limit: Maximum number of identities to return (default 10)

    Returns:
        List of identity performance data including email_address, display_name,
        status, sent_today, daily_limit, bounce_rate, complaint_rate
    """
    query = """
    SELECT
        si.id,
        si.email_address,
        si.display_name,
        si.status,
        si.sent_today,
        si.daily_limit,
        si.bounce_rate,
        si.complaint_rate,
        si.warmup_day,
        si.warmup_enabled,
        COUNT(DISTINCT e.id) FILTER (WHERE e.sent_at >= NOW() - INTERVAL '7 days') as emails_last_7_days,
        COUNT(DISTINCT e.id) FILTER (WHERE e.sent_at >= NOW() - INTERVAL '30 days') as emails_last_30_days
    FROM ses_identities si
    LEFT JOIN email_drafts e ON e.ses_identity_id = si.id
    GROUP BY si.id
    ORDER BY si.sent_today DESC, si.created_at DESC
    LIMIT $1
    """
    rows = await fetch_all(query, limit)
    return [
        {
            "id": str(row["id"]),
            "email_address": row["email_address"],
            "display_name": row["display_name"],
            "status": row["status"],
            "sent_today": row["sent_today"],
            "daily_limit": row["daily_limit"],
            "bounce_rate": float(row["bounce_rate"] or 0),
            "complaint_rate": float(row["complaint_rate"] or 0),
            "warmup_day": row["warmup_day"],
            "warmup_enabled": row["warmup_enabled"],
            "emails_last_7_days": row["emails_last_7_days"],
            "emails_last_30_days": row["emails_last_30_days"],
        }
        for row in rows
    ]


@function_tool
async def get_daily_trends(days: int = 14) -> list[dict]:
    """Get daily email sending and engagement trends.

    Args:
        days: Number of days of history to retrieve (default 14)

    Returns:
        List of daily metrics including date, sent, delivered, opened, clicked, replied, bounced
    """
    query = """
    SELECT
        DATE(sent_at) as date,
        COUNT(*) as sent,
        COUNT(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM email_events ev
            WHERE ev.email_draft_id = e.id AND ev.event_type = 'DELIVERED'
        )) as delivered,
        COUNT(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM email_events ev
            WHERE ev.email_draft_id = e.id AND ev.event_type = 'OPEN'
        )) as opened,
        COUNT(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM email_events ev
            WHERE ev.email_draft_id = e.id AND ev.event_type = 'CLICK'
        )) as clicked,
        COUNT(*) FILTER (WHERE status = 'REPLIED') as replied,
        COUNT(*) FILTER (WHERE status = 'BOUNCED') as bounced
    FROM email_drafts e
    WHERE sent_at >= NOW() - ($1 || ' days')::interval
        AND sent_at IS NOT NULL
    GROUP BY DATE(sent_at)
    ORDER BY date DESC
    """
    rows = await fetch_all(query, str(days))
    return [
        {
            "date": row["date"].isoformat() if row["date"] else None,
            "sent": row["sent"],
            "delivered": row["delivered"],
            "opened": row["opened"],
            "clicked": row["clicked"],
            "replied": row["replied"],
            "bounced": row["bounced"],
        }
        for row in rows
    ]
