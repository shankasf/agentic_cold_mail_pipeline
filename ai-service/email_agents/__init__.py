"""
OpenAI Agents SDK Multi-Agent Pipeline for Email Generation.

This module orchestrates 5 agents:
1. EntityResolver - Extracts businesses, contacts, and evidence from chunks
2. BusinessAnalyzer - Analyzes business and selects facts for personalization
3. EmailWriter - Generates the cold email
4. ComplianceChecker - Validates deliverability and compliance
5. Gatekeeper - Makes final status decision
"""
from .entity_resolver import entity_resolver_agent, resolve_entities
from .business_analyzer import business_analyzer_agent, analyze_business
from .email_writer import email_writer_agent, write_email
from .compliance_checker import compliance_agent, check_compliance
from .gatekeeper import gatekeeper_agent, make_decision

__all__ = [
    'entity_resolver_agent',
    'resolve_entities',
    'business_analyzer_agent',
    'analyze_business',
    'email_writer_agent',
    'write_email',
    'compliance_agent',
    'check_compliance',
    'gatekeeper_agent',
    'make_decision',
]
