"""
Multi-agent system for the email marketing chatbot.
Each agent specializes in a specific domain of the application.
"""

from .router_agent import router_agent
from .analytics_agent import analytics_agent
from .emails_agent import emails_agent
from .contacts_agent import contacts_agent
from .inbox_agent import inbox_agent
from .campaigns_agent import campaigns_agent
from .suggestions_agent import suggestions_agent

__all__ = [
    "router_agent",
    "analytics_agent",
    "emails_agent",
    "contacts_agent",
    "inbox_agent",
    "campaigns_agent",
    "suggestions_agent",
]
