"""
Multi-agent chatbot system for email marketing application.
Uses OpenAI Agents SDK with specialized agents for different domains.
"""

from .router import router as chatbot_router

__all__ = ["chatbot_router"]
