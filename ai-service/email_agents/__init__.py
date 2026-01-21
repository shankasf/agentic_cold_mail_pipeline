"""
OpenAI Agents SDK Multi-Agent Pipeline for Email Generation.

This module orchestrates 7 agents:
1. ColumnMapper - Intelligently maps raw file columns to schema fields
2. EntityResolver - Extracts businesses, contacts, and evidence from chunks
3. BusinessAnalyzer - Analyzes business and selects facts for personalization
4. EmailWriter - Generates the cold email
5. ComplianceChecker - Validates deliverability and compliance
6. Gatekeeper - Makes final status decision
7. TemplateGenerator - Generates email templates from uploaded documents
"""
from .column_mapper import column_mapper_agent, map_columns, get_mapping_dict
from .entity_resolver import entity_resolver_agent, resolve_entities
from .business_analyzer import business_analyzer_agent, analyze_business
from .email_writer import email_writer_agent, write_email
from .compliance_checker import compliance_agent, check_compliance
from .gatekeeper import gatekeeper_agent, make_decision
from .template_generator import template_generator_agent, generate_templates

__all__ = [
    'column_mapper_agent',
    'map_columns',
    'get_mapping_dict',
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
    'template_generator_agent',
    'generate_templates',
]
