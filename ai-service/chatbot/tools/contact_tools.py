"""
Contact tools for searching and analyzing contacts and leads.
"""

from agents import function_tool
from ..db import fetch_one, fetch_all


@function_tool
async def search_contacts(
    query: str = "",
    validation_status: str = "",
    limit: int = 20
) -> list[dict]:
    """Search contacts by email, name, or company name.

    Args:
        query: Search text to find in email, name, role, or business name (optional)
        validation_status: Filter by validation status: PENDING, VALID, INVALID, RISKY, BLOCKED (optional)
        limit: Maximum number of results (default 20)

    Returns:
        List of matching contacts with id, email, name, role, business_name,
        validation_status, email_validated, created_at
    """
    conditions = []
    params = []
    param_count = 0

    if query:
        param_count += 1
        conditions.append(f"""
            (c.email ILIKE '%' || ${param_count} || '%'
            OR c.name ILIKE '%' || ${param_count} || '%'
            OR c.role ILIKE '%' || ${param_count} || '%'
            OR b.canonical_name ILIKE '%' || ${param_count} || '%')
        """)
        params.append(query)

    if validation_status:
        param_count += 1
        conditions.append(f"c.validation_status = ${param_count}")
        params.append(validation_status)

    where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
    param_count += 1

    sql = f"""
    SELECT
        c.id,
        c.email,
        c.name,
        c.role,
        c.phone,
        c.linkedin_url,
        c.email_validated,
        c.validation_status,
        c.validated_at,
        c.created_at,
        b.id as business_id,
        b.canonical_name as business_name,
        b.industry_guess,
        b.location
    FROM contacts c
    JOIN businesses b ON c.business_id = b.id
    {where_clause}
    ORDER BY c.created_at DESC
    LIMIT ${param_count}
    """
    params.append(limit)

    rows = await fetch_all(sql, *params)
    return [
        {
            "id": str(row["id"]),
            "email": row["email"],
            "name": row["name"],
            "role": row["role"],
            "phone": row["phone"],
            "linkedin_url": row["linkedin_url"],
            "email_validated": row["email_validated"],
            "validation_status": row["validation_status"],
            "validated_at": row["validated_at"].isoformat() if row["validated_at"] else None,
            "business_id": str(row["business_id"]),
            "business_name": row["business_name"],
            "industry": row["industry_guess"],
            "location": row["location"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        }
        for row in rows
    ]


@function_tool
async def get_validation_stats() -> dict:
    """Get email validation statistics across all contacts.

    Returns:
        Dictionary with validation_status counts, total_contacts,
        validated_count, and validation_rate
    """
    query = """
    SELECT
        COUNT(*) as total_contacts,
        COUNT(*) FILTER (WHERE validation_status = 'PENDING') as pending,
        COUNT(*) FILTER (WHERE validation_status = 'VALID') as valid,
        COUNT(*) FILTER (WHERE validation_status = 'INVALID') as invalid,
        COUNT(*) FILTER (WHERE validation_status = 'RISKY') as risky,
        COUNT(*) FILTER (WHERE validation_status = 'BLOCKED') as blocked,
        COUNT(*) FILTER (WHERE email_validated = true) as validated_count,
        CASE
            WHEN COUNT(*) > 0
            THEN ROUND(100.0 * COUNT(*) FILTER (WHERE email_validated = true) / COUNT(*), 2)
            ELSE 0
        END as validation_rate
    FROM contacts
    """
    result = await fetch_one(query)
    if result:
        return {
            "total_contacts": result["total_contacts"],
            "by_status": {
                "pending": result["pending"],
                "valid": result["valid"],
                "invalid": result["invalid"],
                "risky": result["risky"],
                "blocked": result["blocked"],
            },
            "validated_count": result["validated_count"],
            "validation_rate": float(result["validation_rate"]),
        }
    return {"error": "No data found"}


@function_tool
async def get_business_details(business_id: str = "", business_name: str = "") -> dict:
    """Get detailed information about a specific business.

    Args:
        business_id: UUID of the business (optional)
        business_name: Name to search for (optional, used if business_id not provided)

    Returns:
        Business details including name, website, industry, location, contacts,
        email_count, recent_emails
    """
    if not business_id and not business_name:
        return {"error": "Either business_id or business_name is required"}

    if business_id:
        condition = "b.id = $1"
        param = business_id
    else:
        condition = "b.canonical_name ILIKE '%' || $1 || '%'"
        param = business_name

    query = f"""
    SELECT
        b.id,
        b.canonical_name,
        b.website,
        b.industry_guess,
        b.location,
        b.custom_data,
        b.enrichment_data,
        b.created_at,
        b.updated_at,
        b.campaign_id,
        (SELECT COUNT(*) FROM contacts WHERE business_id = b.id) as contact_count,
        (SELECT COUNT(*) FROM email_drafts WHERE business_id = b.id) as email_count,
        (SELECT COUNT(*) FROM email_drafts WHERE business_id = b.id AND status = 'SENT') as sent_count,
        (SELECT COUNT(*) FROM email_drafts WHERE business_id = b.id AND status = 'REPLIED') as reply_count
    FROM businesses b
    WHERE {condition}
    LIMIT 1
    """
    business = await fetch_one(query, param)

    if not business:
        return {"error": "Business not found"}

    # Get contacts for this business
    contacts_query = """
    SELECT id, email, name, role, validation_status
    FROM contacts
    WHERE business_id = $1
    ORDER BY created_at DESC
    LIMIT 10
    """
    contacts = await fetch_all(contacts_query, business["id"])

    # Get recent emails
    emails_query = """
    SELECT id, subject, status, created_at, sent_at
    FROM email_drafts
    WHERE business_id = $1
    ORDER BY created_at DESC
    LIMIT 5
    """
    emails = await fetch_all(emails_query, business["id"])

    return {
        "id": str(business["id"]),
        "name": business["canonical_name"],
        "website": business["website"],
        "industry": business["industry_guess"],
        "location": business["location"],
        "custom_data": business["custom_data"],
        "enrichment_data": business["enrichment_data"],
        "campaign_id": str(business["campaign_id"]) if business["campaign_id"] else None,
        "contact_count": business["contact_count"],
        "email_count": business["email_count"],
        "sent_count": business["sent_count"],
        "reply_count": business["reply_count"],
        "created_at": business["created_at"].isoformat() if business["created_at"] else None,
        "contacts": [
            {
                "id": str(c["id"]),
                "email": c["email"],
                "name": c["name"],
                "role": c["role"],
                "validation_status": c["validation_status"],
            }
            for c in contacts
        ],
        "recent_emails": [
            {
                "id": str(e["id"]),
                "subject": e["subject"],
                "status": e["status"],
                "created_at": e["created_at"].isoformat() if e["created_at"] else None,
                "sent_at": e["sent_at"].isoformat() if e["sent_at"] else None,
            }
            for e in emails
        ],
    }
