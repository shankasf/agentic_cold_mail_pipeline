"""
Inbox tools for managing inbound replies and email threads.
"""

from agents import function_tool
from ..db import fetch_one, fetch_all


@function_tool
async def get_unread_replies(limit: int = 20) -> list[dict]:
    """Get unread inbound email replies.

    Args:
        limit: Maximum number of results (default 20)

    Returns:
        List of unread replies with id, subject, from_email, from_name,
        body_preview, business_name, received_at
    """
    query = """
    SELECT
        ie.id,
        ie.subject,
        ie.from_email,
        ie.from_name,
        ie.body_text,
        ie.thread_id,
        ie.received_at,
        ie.is_starred,
        b.canonical_name as business_name,
        b.id as business_id,
        c.name as contact_name
    FROM inbound_emails ie
    LEFT JOIN businesses b ON ie.business_id = b.id
    LEFT JOIN contacts c ON ie.contact_id = c.id
    WHERE ie.is_read = false AND ie.is_archived = false
    ORDER BY ie.received_at DESC
    LIMIT $1
    """
    rows = await fetch_all(query, limit)
    return [
        {
            "id": str(row["id"]),
            "subject": row["subject"],
            "from_email": row["from_email"],
            "from_name": row["from_name"],
            "body_preview": row["body_text"][:200] + "..." if row["body_text"] and len(row["body_text"]) > 200 else row["body_text"],
            "thread_id": row["thread_id"],
            "business_name": row["business_name"],
            "business_id": str(row["business_id"]) if row["business_id"] else None,
            "contact_name": row["contact_name"],
            "is_starred": row["is_starred"],
            "received_at": row["received_at"].isoformat() if row["received_at"] else None,
        }
        for row in rows
    ]


@function_tool
async def get_thread_history(thread_id: str = "", contact_email: str = "", limit: int = 20) -> list[dict]:
    """Get the email thread history for a conversation.

    Args:
        thread_id: Thread ID to fetch (optional)
        contact_email: Contact email to find threads for (optional, used if thread_id not provided)
        limit: Maximum number of messages (default 20)

    Returns:
        List of messages in the thread (both outbound and inbound) ordered by date
    """
    if not thread_id and not contact_email:
        return [{"error": "Either thread_id or contact_email is required"}]

    messages = []

    if thread_id:
        # Get outbound emails in thread
        outbound_query = """
        SELECT
            e.id,
            'outbound' as direction,
            e.subject,
            e.body_text,
            e.from_email,
            e.from_name,
            c.email as to_email,
            c.name as to_name,
            e.status,
            e.sent_at as message_date
        FROM email_drafts e
        JOIN contacts c ON e.contact_id = c.id
        WHERE e.thread_id = $1 AND e.sent_at IS NOT NULL
        """
        outbound = await fetch_all(outbound_query, thread_id)
        messages.extend(outbound)

        # Get inbound emails in thread
        inbound_query = """
        SELECT
            ie.id,
            'inbound' as direction,
            ie.subject,
            ie.body_text,
            ie.from_email,
            ie.from_name,
            ie.to_email,
            NULL as to_name,
            CASE WHEN ie.is_read THEN 'READ' ELSE 'UNREAD' END as status,
            ie.received_at as message_date
        FROM inbound_emails ie
        WHERE ie.thread_id = $1
        """
        inbound = await fetch_all(inbound_query, thread_id)
        messages.extend(inbound)
    else:
        # Find threads by contact email
        outbound_query = """
        SELECT
            e.id,
            'outbound' as direction,
            e.subject,
            e.body_text,
            e.from_email,
            e.from_name,
            c.email as to_email,
            c.name as to_name,
            e.status,
            e.sent_at as message_date
        FROM email_drafts e
        JOIN contacts c ON e.contact_id = c.id
        WHERE c.email = $1 AND e.sent_at IS NOT NULL
        ORDER BY e.sent_at DESC
        LIMIT $2
        """
        outbound = await fetch_all(outbound_query, contact_email, limit)
        messages.extend(outbound)

        inbound_query = """
        SELECT
            ie.id,
            'inbound' as direction,
            ie.subject,
            ie.body_text,
            ie.from_email,
            ie.from_name,
            ie.to_email,
            NULL as to_name,
            CASE WHEN ie.is_read THEN 'READ' ELSE 'UNREAD' END as status,
            ie.received_at as message_date
        FROM inbound_emails ie
        WHERE ie.from_email = $1
        ORDER BY ie.received_at DESC
        LIMIT $2
        """
        inbound = await fetch_all(inbound_query, contact_email, limit)
        messages.extend(inbound)

    # Sort by date
    messages.sort(key=lambda x: x["message_date"] if x["message_date"] else "", reverse=True)

    return [
        {
            "id": str(msg["id"]),
            "direction": msg["direction"],
            "subject": msg["subject"],
            "body_preview": msg["body_text"][:300] + "..." if msg["body_text"] and len(msg["body_text"]) > 300 else msg["body_text"],
            "from_email": msg["from_email"],
            "from_name": msg["from_name"],
            "to_email": msg["to_email"],
            "to_name": msg["to_name"],
            "status": msg["status"],
            "date": msg["message_date"].isoformat() if msg["message_date"] else None,
        }
        for msg in messages[:limit]
    ]


@function_tool
async def get_inbox_stats() -> dict:
    """Get inbox statistics including unread count, starred, and response metrics.

    Returns:
        Dictionary with total_inbound, unread_count, starred_count, archived_count,
        replied_emails (count of emails that got replies), avg_response_time_hours
    """
    query = """
    SELECT
        COUNT(*) as total_inbound,
        COUNT(*) FILTER (WHERE is_read = false AND is_archived = false) as unread_count,
        COUNT(*) FILTER (WHERE is_starred = true) as starred_count,
        COUNT(*) FILTER (WHERE is_archived = true) as archived_count,
        COUNT(DISTINCT original_email_id) FILTER (WHERE original_email_id IS NOT NULL) as replied_emails
    FROM inbound_emails
    """
    result = await fetch_one(query)

    # Get response time stats
    response_time_query = """
    SELECT
        AVG(EXTRACT(EPOCH FROM (ie.received_at - e.sent_at)) / 3600) as avg_response_hours
    FROM inbound_emails ie
    JOIN email_drafts e ON ie.original_email_id = e.id
    WHERE e.sent_at IS NOT NULL AND ie.received_at IS NOT NULL
    """
    response_time = await fetch_one(response_time_query)

    # Get today's stats
    today_query = """
    SELECT
        COUNT(*) as received_today,
        COUNT(*) FILTER (WHERE is_read = false) as unread_today
    FROM inbound_emails
    WHERE DATE(received_at) = CURRENT_DATE
    """
    today_stats = await fetch_one(today_query)

    if result:
        return {
            "total_inbound": result["total_inbound"],
            "unread_count": result["unread_count"],
            "starred_count": result["starred_count"],
            "archived_count": result["archived_count"],
            "replied_emails": result["replied_emails"],
            "avg_response_time_hours": round(float(response_time["avg_response_hours"] or 0), 2) if response_time else 0,
            "received_today": today_stats["received_today"] if today_stats else 0,
            "unread_today": today_stats["unread_today"] if today_stats else 0,
        }
    return {"error": "No data found"}
