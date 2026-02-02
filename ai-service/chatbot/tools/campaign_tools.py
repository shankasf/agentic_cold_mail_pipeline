"""
Campaign tools for managing and analyzing campaigns.
"""

from agents import function_tool
from ..db import fetch_one, fetch_all


@function_tool
async def list_campaigns(status: str = "", limit: int = 20) -> list[dict]:
    """List all campaigns with basic statistics.

    Args:
        status: Filter by status: DRAFT, ACTIVE, PAUSED, COMPLETED, ARCHIVED (optional)
        limit: Maximum number of results (default 20)

    Returns:
        List of campaigns with id, name, status, total_contacts, total_businesses,
        created_at, updated_at
    """
    conditions = []
    params = []
    param_count = 0

    if status:
        param_count += 1
        conditions.append(f"c.status = ${param_count}")
        params.append(status)

    where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
    param_count += 1

    query = f"""
    SELECT
        c.id,
        c.name,
        c.description,
        c.status,
        c.total_contacts,
        c.validated_contacts,
        c.valid_emails,
        c.invalid_emails,
        c.validation_rate,
        c.created_at,
        c.updated_at,
        (SELECT COUNT(*) FROM businesses WHERE campaign_id = c.id) as business_count,
        (SELECT COUNT(*) FROM leads WHERE campaign_id = c.id) as lead_count,
        (SELECT COUNT(*) FROM email_drafts e
         JOIN businesses b ON e.business_id = b.id
         WHERE b.campaign_id = c.id AND e.status = 'SENT') as emails_sent,
        (SELECT COUNT(*) FROM email_drafts e
         JOIN businesses b ON e.business_id = b.id
         WHERE b.campaign_id = c.id AND e.status = 'REPLIED') as emails_replied
    FROM campaigns c
    {where_clause}
    ORDER BY c.created_at DESC
    LIMIT ${param_count}
    """
    params.append(limit)

    rows = await fetch_all(query, *params)
    return [
        {
            "id": str(row["id"]),
            "name": row["name"],
            "description": row["description"],
            "status": row["status"],
            "total_contacts": row["total_contacts"],
            "validated_contacts": row["validated_contacts"],
            "valid_emails": row["valid_emails"],
            "invalid_emails": row["invalid_emails"],
            "validation_rate": float(row["validation_rate"] or 0),
            "business_count": row["business_count"],
            "lead_count": row["lead_count"],
            "emails_sent": row["emails_sent"],
            "emails_replied": row["emails_replied"],
            "reply_rate": round(100.0 * row["emails_replied"] / row["emails_sent"], 2) if row["emails_sent"] > 0 else 0,
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        }
        for row in rows
    ]


@function_tool
async def get_campaign_details(campaign_id: str = "", campaign_name: str = "") -> dict:
    """Get detailed information about a specific campaign.

    Args:
        campaign_id: UUID of the campaign (optional)
        campaign_name: Name to search for (optional, used if campaign_id not provided)

    Returns:
        Campaign details including stats, businesses, leads breakdown, and recent activity
    """
    if not campaign_id and not campaign_name:
        return {"error": "Either campaign_id or campaign_name is required"}

    if campaign_id:
        condition = "c.id = $1"
        param = campaign_id
    else:
        condition = "c.name ILIKE '%' || $1 || '%'"
        param = campaign_name

    query = f"""
    SELECT
        c.id,
        c.name,
        c.description,
        c.status,
        c.total_contacts,
        c.validated_contacts,
        c.valid_emails,
        c.invalid_emails,
        c.risky_emails,
        c.blocked_emails,
        c.validation_rate,
        c.created_at,
        c.updated_at
    FROM campaigns c
    WHERE {condition}
    LIMIT 1
    """
    campaign = await fetch_one(query, param)

    if not campaign:
        return {"error": "Campaign not found"}

    # Get business stats
    business_stats_query = """
    SELECT
        COUNT(*) as total,
        COUNT(DISTINCT industry_guess) as unique_industries,
        COUNT(DISTINCT location) as unique_locations
    FROM businesses
    WHERE campaign_id = $1
    """
    business_stats = await fetch_one(business_stats_query, campaign["id"])

    # Get lead status breakdown
    lead_stats_query = """
    SELECT
        status,
        COUNT(*) as count
    FROM leads
    WHERE campaign_id = $1
    GROUP BY status
    """
    lead_stats = await fetch_all(lead_stats_query, campaign["id"])

    # Get email stats
    email_stats_query = """
    SELECT
        COUNT(*) as total_emails,
        COUNT(*) FILTER (WHERE e.status = 'DRAFT') as drafts,
        COUNT(*) FILTER (WHERE e.status = 'APPROVED') as approved,
        COUNT(*) FILTER (WHERE e.status = 'SENT') as sent,
        COUNT(*) FILTER (WHERE e.status = 'REPLIED') as replied,
        COUNT(*) FILTER (WHERE e.status = 'BOUNCED') as bounced,
        AVG(e.confidence_score) as avg_confidence,
        AVG(e.deliverability_score) as avg_deliverability
    FROM email_drafts e
    JOIN businesses b ON e.business_id = b.id
    WHERE b.campaign_id = $1
    """
    email_stats = await fetch_one(email_stats_query, campaign["id"])

    # Get top industries
    industries_query = """
    SELECT industry_guess as industry, COUNT(*) as count
    FROM businesses
    WHERE campaign_id = $1 AND industry_guess IS NOT NULL
    GROUP BY industry_guess
    ORDER BY count DESC
    LIMIT 5
    """
    industries = await fetch_all(industries_query, campaign["id"])

    return {
        "id": str(campaign["id"]),
        "name": campaign["name"],
        "description": campaign["description"],
        "status": campaign["status"],
        "contacts": {
            "total": campaign["total_contacts"],
            "validated": campaign["validated_contacts"],
            "valid_emails": campaign["valid_emails"],
            "invalid_emails": campaign["invalid_emails"],
            "risky_emails": campaign["risky_emails"],
            "blocked_emails": campaign["blocked_emails"],
            "validation_rate": float(campaign["validation_rate"] or 0),
        },
        "businesses": {
            "total": business_stats["total"] if business_stats else 0,
            "unique_industries": business_stats["unique_industries"] if business_stats else 0,
            "unique_locations": business_stats["unique_locations"] if business_stats else 0,
        },
        "lead_status_breakdown": {row["status"]: row["count"] for row in lead_stats} if lead_stats else {},
        "emails": {
            "total": email_stats["total_emails"] if email_stats else 0,
            "drafts": email_stats["drafts"] if email_stats else 0,
            "approved": email_stats["approved"] if email_stats else 0,
            "sent": email_stats["sent"] if email_stats else 0,
            "replied": email_stats["replied"] if email_stats else 0,
            "bounced": email_stats["bounced"] if email_stats else 0,
            "avg_confidence": round(float(email_stats["avg_confidence"] or 0), 2) if email_stats else 0,
            "avg_deliverability": round(float(email_stats["avg_deliverability"] or 0), 2) if email_stats else 0,
        },
        "top_industries": [
            {"industry": row["industry"], "count": row["count"]}
            for row in industries
        ] if industries else [],
        "created_at": campaign["created_at"].isoformat() if campaign["created_at"] else None,
        "updated_at": campaign["updated_at"].isoformat() if campaign["updated_at"] else None,
    }


@function_tool
async def get_lead_engagement(campaign_id: str = "", status: str = "", limit: int = 20) -> list[dict]:
    """Get lead engagement data for a campaign.

    Args:
        campaign_id: Filter by campaign UUID (optional)
        status: Filter by lead status: NOT_CONTACTED, CONTACTED, OPENED, CLICKED, REPLIED, etc. (optional)
        limit: Maximum number of results (default 20)

    Returns:
        List of leads with engagement data including email, company, status,
        last_contacted_at, enrichment_data
    """
    conditions = []
    params = []
    param_count = 0

    if campaign_id:
        param_count += 1
        conditions.append(f"l.campaign_id = ${param_count}")
        params.append(campaign_id)

    if status:
        param_count += 1
        conditions.append(f"l.status = ${param_count}")
        params.append(status)

    where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
    param_count += 1

    query = f"""
    SELECT
        l.id,
        l.email,
        l.first_name,
        l.last_name,
        l.company,
        l.title,
        l.industry,
        l.location,
        l.status,
        l.last_contacted_at,
        l.enrichment_data,
        l.tags,
        l.source,
        l.created_at,
        c.name as campaign_name
    FROM leads l
    LEFT JOIN campaigns c ON l.campaign_id = c.id
    {where_clause}
    ORDER BY
        CASE l.status
            WHEN 'REPLIED' THEN 1
            WHEN 'INTERESTED' THEN 2
            WHEN 'MEETING_BOOKED' THEN 3
            WHEN 'CLICKED' THEN 4
            WHEN 'OPENED' THEN 5
            ELSE 10
        END,
        l.last_contacted_at DESC NULLS LAST
    LIMIT ${param_count}
    """
    params.append(limit)

    rows = await fetch_all(query, *params)
    return [
        {
            "id": str(row["id"]),
            "email": row["email"],
            "name": f"{row['first_name'] or ''} {row['last_name'] or ''}".strip() or None,
            "company": row["company"],
            "title": row["title"],
            "industry": row["industry"],
            "location": row["location"],
            "status": row["status"],
            "campaign_name": row["campaign_name"],
            "last_contacted_at": row["last_contacted_at"].isoformat() if row["last_contacted_at"] else None,
            "tags": row["tags"],
            "source": row["source"],
            "enrichment_data": row["enrichment_data"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        }
        for row in rows
    ]
