"""
Tool functions for the chatbot agents.
Each tool is decorated with @function_tool for use with OpenAI Agents SDK.
"""

from .analytics_tools import (
    get_analytics_summary,
    get_identity_performance,
    get_daily_trends,
)
from .email_tools import (
    search_emails,
    get_email_status_breakdown,
    get_emails_needing_review,
)
from .contact_tools import (
    search_contacts,
    get_validation_stats,
    get_business_details,
)
from .inbox_tools import (
    get_unread_replies,
    get_thread_history,
    get_inbox_stats,
)
from .campaign_tools import (
    list_campaigns,
    get_campaign_details,
    get_lead_engagement,
)

__all__ = [
    # Analytics tools
    "get_analytics_summary",
    "get_identity_performance",
    "get_daily_trends",
    # Email tools
    "search_emails",
    "get_email_status_breakdown",
    "get_emails_needing_review",
    # Contact tools
    "search_contacts",
    "get_validation_stats",
    "get_business_details",
    # Inbox tools
    "get_unread_replies",
    "get_thread_history",
    "get_inbox_stats",
    # Campaign tools
    "list_campaigns",
    "get_campaign_details",
    "get_lead_engagement",
]
