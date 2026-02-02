"""
Email tools for searching and analyzing email drafts.
"""

from agents import function_tool
from ..db import fetch_one, fetch_all


@function_tool
async def search_emails(
    query: str = "",
    status: str = "",
    limit: int = 20
) -> list[dict]:
    """Search email drafts by subject, body content, or business name.

    Args:
        query: Search text to find in subject, body, or business name (optional)
        status: Filter by status: DRAFT, NEEDS_REVIEW, APPROVED, EXPORTED, SENT, REPLIED, BOUNCED, COMPLAINT (optional)
        limit: Maximum number of results (default 20)

    Returns:
        List of matching emails with id, subject, status, business_name, contact_email,
        confidence_score, deliverability_score, created_at, sent_at
    """
    conditions = []
    params = []
    param_count = 0

    if query:
        param_count += 1
        conditions.append(f"""
            (e.subject ILIKE '%' || ${param_count} || '%'
            OR e.body_text ILIKE '%' || ${param_count} || '%'
            OR b.canonical_name ILIKE '%' || ${param_count} || '%')
        """)
        params.append(query)

    if status:
        param_count += 1
        conditions.append(f"e.status = ${param_count}")
        params.append(status)

    where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
    param_count += 1

    sql = f"""
    SELECT
        e.id,
        e.subject,
        e.status,
        e.confidence_score,
        e.deliverability_score,
        e.spam_flags,
        e.created_at,
        e.sent_at,
        b.canonical_name as business_name,
        c.email as contact_email,
        c.name as contact_name
    FROM email_drafts e
    JOIN businesses b ON e.business_id = b.id
    JOIN contacts c ON e.contact_id = c.id
    {where_clause}
    ORDER BY e.created_at DESC
    LIMIT ${param_count}
    """
    params.append(limit)

    rows = await fetch_all(sql, *params)
    return [
        {
            "id": str(row["id"]),
            "subject": row["subject"],
            "status": row["status"],
            "business_name": row["business_name"],
            "contact_email": row["contact_email"],
            "contact_name": row["contact_name"],
            "confidence_score": row["confidence_score"],
            "deliverability_score": row["deliverability_score"],
            "spam_flags": row["spam_flags"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "sent_at": row["sent_at"].isoformat() if row["sent_at"] else None,
        }
        for row in rows
    ]


@function_tool
async def get_email_status_breakdown() -> dict:
    """Get a breakdown of emails by status.

    Returns:
        Dictionary with counts for each status: draft, needs_review, approved,
        exported, sent, replied, bounced, complaint, and total
    """
    query = """
    SELECT
        COUNT(*) FILTER (WHERE status = 'DRAFT') as draft,
        COUNT(*) FILTER (WHERE status = 'NEEDS_REVIEW') as needs_review,
        COUNT(*) FILTER (WHERE status = 'APPROVED') as approved,
        COUNT(*) FILTER (WHERE status = 'EXPORTED') as exported,
        COUNT(*) FILTER (WHERE status = 'SENT') as sent,
        COUNT(*) FILTER (WHERE status = 'REPLIED') as replied,
        COUNT(*) FILTER (WHERE status = 'BOUNCED') as bounced,
        COUNT(*) FILTER (WHERE status = 'COMPLAINT') as complaint,
        COUNT(*) as total
    FROM email_drafts
    """
    result = await fetch_one(query)
    if result:
        return {
            "draft": result["draft"],
            "needs_review": result["needs_review"],
            "approved": result["approved"],
            "exported": result["exported"],
            "sent": result["sent"],
            "replied": result["replied"],
            "bounced": result["bounced"],
            "complaint": result["complaint"],
            "total": result["total"],
        }
    return {"error": "No data found"}


@function_tool
async def get_emails_needing_review(limit: int = 20) -> list[dict]:
    """Get emails that need human review (low confidence or deliverability scores).

    Args:
        limit: Maximum number of results (default 20)

    Returns:
        List of emails needing review with id, subject, business_name, contact_email,
        confidence_score, deliverability_score, spam_flags, review_reason
    """
    query = """
    SELECT
        e.id,
        e.subject,
        e.body_text,
        e.status,
        e.confidence_score,
        e.deliverability_score,
        e.spam_flags,
        e.created_at,
        b.canonical_name as business_name,
        c.email as contact_email,
        c.name as contact_name,
        CASE
            WHEN e.status = 'NEEDS_REVIEW' THEN 'Flagged for review'
            WHEN e.confidence_score < 70 THEN 'Low confidence score'
            WHEN e.deliverability_score < 70 THEN 'Low deliverability score'
            WHEN jsonb_array_length(e.spam_flags) > 0 THEN 'Has spam flags'
            ELSE 'Unknown'
        END as review_reason
    FROM email_drafts e
    JOIN businesses b ON e.business_id = b.id
    JOIN contacts c ON e.contact_id = c.id
    WHERE e.status IN ('DRAFT', 'NEEDS_REVIEW')
        AND (
            e.status = 'NEEDS_REVIEW'
            OR e.confidence_score < 70
            OR e.deliverability_score < 70
            OR jsonb_array_length(e.spam_flags) > 0
        )
    ORDER BY e.confidence_score ASC, e.deliverability_score ASC
    LIMIT $1
    """
    rows = await fetch_all(query, limit)
    return [
        {
            "id": str(row["id"]),
            "subject": row["subject"],
            "body_preview": row["body_text"][:200] + "..." if len(row["body_text"]) > 200 else row["body_text"],
            "status": row["status"],
            "business_name": row["business_name"],
            "contact_email": row["contact_email"],
            "contact_name": row["contact_name"],
            "confidence_score": row["confidence_score"],
            "deliverability_score": row["deliverability_score"],
            "spam_flags": row["spam_flags"],
            "review_reason": row["review_reason"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        }
        for row in rows
    ]
