"""
Circuit Breaker Wrappers for AI Agents.

These wrappers provide fault-tolerance for OpenAI API calls by using
the circuit breaker pattern to prevent cascading failures.
"""
import asyncio
from typing import Optional
from circuit_breaker import openai_circuit_breaker, CircuitBreakerError
from agent_logger import logger
from schemas import (
    EntityResolverOutput,
    BusinessAnalyzerOutput,
    EmailWriterOutput,
    ComplianceOutput,
    GatekeeperOutput,
)


async def safe_resolve_entities(
    chunks: list[dict],
    fallback_result: Optional[EntityResolverOutput] = None,
) -> EntityResolverOutput:
    """
    Resolve entities with circuit breaker protection.

    Args:
        chunks: List of parsed chunks
        fallback_result: Optional fallback if circuit is open

    Returns:
        EntityResolverOutput

    Raises:
        CircuitBreakerError: If circuit is open and no fallback provided
    """
    from email_agents import resolve_entities

    async def _call():
        return await resolve_entities(chunks)

    async def _fallback(*args, **kwargs):
        if fallback_result:
            logger.warn("Using fallback result for entity resolution", agent="EntityResolver")
            return fallback_result
        # Return empty result as default fallback
        return EntityResolverOutput(
            businesses=[],
            contacts=[],
            evidence=[],
        )

    return await openai_circuit_breaker.call(
        _call,
        fallback=_fallback if fallback_result else None,
    )


async def safe_analyze_business(
    business: dict,
    evidence: list[dict],
    chunks: list[dict],
    industry_playbook: Optional[dict] = None,
    fallback_result: Optional[BusinessAnalyzerOutput] = None,
) -> BusinessAnalyzerOutput:
    """
    Analyze business with circuit breaker protection.

    Args:
        business: Business data
        evidence: List of evidence
        chunks: Relevant chunks
        industry_playbook: Optional playbook
        fallback_result: Optional fallback if circuit is open

    Returns:
        BusinessAnalyzerOutput
    """
    from email_agents import analyze_business

    async def _call():
        return await analyze_business(business, evidence, chunks, industry_playbook)

    async def _fallback(*args, **kwargs):
        if fallback_result:
            logger.warn("Using fallback result for business analysis", agent="BusinessAnalyzer")
            return fallback_result
        # Return minimal analysis as default fallback
        from schemas import FactUsed
        return BusinessAnalyzerOutput(
            facts_used=[
                FactUsed(
                    type="OTHER",
                    value=f"Company: {business.get('canonical_name', 'Unknown')}",
                    chunk_id="",
                    confidence=70,
                )
            ],
            platforms_tools_found=[],
            inferred_pain_point="general business challenges",
            needs_review=True,  # Mark for review when using fallback
        )

    return await openai_circuit_breaker.call(
        _call,
        fallback=_fallback if fallback_result else None,
    )


async def safe_write_email(
    business: dict,
    contact: dict,
    facts_used: list[dict],
    pain_point: Optional[str] = None,
    industry_playbook: Optional[dict] = None,
    custom_business_data: Optional[dict] = None,
    custom_contact_data: Optional[dict] = None,
    fallback_result: Optional[EmailWriterOutput] = None,
) -> EmailWriterOutput:
    """
    Write email with circuit breaker protection.

    Args:
        business: Business data
        contact: Contact data
        facts_used: List of facts
        pain_point: Optional pain point
        industry_playbook: Optional playbook
        custom_business_data: Custom business data
        custom_contact_data: Custom contact data
        fallback_result: Optional fallback if circuit is open

    Returns:
        EmailWriterOutput
    """
    from email_agents import write_email

    async def _call():
        return await write_email(
            business=business,
            contact=contact,
            facts_used=facts_used,
            pain_point=pain_point,
            industry_playbook=industry_playbook,
            custom_business_data=custom_business_data,
            custom_contact_data=custom_contact_data,
        )

    if fallback_result:
        async def _fallback(*args, **kwargs):
            logger.warn("Using fallback result for email writing", agent="EmailWriter")
            return fallback_result

        return await openai_circuit_breaker.call(_call, fallback=_fallback)

    # No fallback for email writing - we need original content
    return await openai_circuit_breaker.call(_call)


async def safe_check_compliance(
    subject: str,
    body_text: str,
    fallback_result: Optional[ComplianceOutput] = None,
) -> ComplianceOutput:
    """
    Check compliance with circuit breaker protection.

    Args:
        subject: Email subject
        body_text: Email body
        fallback_result: Optional fallback if circuit is open

    Returns:
        ComplianceOutput
    """
    from email_agents import check_compliance

    async def _call():
        return await check_compliance(subject, body_text)

    async def _fallback(*args, **kwargs):
        if fallback_result:
            logger.warn("Using fallback result for compliance check", agent="ComplianceChecker")
            return fallback_result
        # Return conservative compliance result as default fallback
        # Mark as needing review when circuit is open
        return ComplianceOutput(
            deliverability_score=70,  # Below threshold to force review
            spam_flags=["Circuit breaker active - manual review required"],
            suggestions=["OpenAI service temporarily unavailable. Please review manually."],
            footer_text="",
        )

    return await openai_circuit_breaker.call(
        _call,
        fallback=_fallback,
    )


async def safe_make_decision(
    confidence_score: int,
    deliverability_score: int,
    spam_flags: list[str],
    analyzer_needs_review: bool,
    fallback_result: Optional[GatekeeperOutput] = None,
) -> GatekeeperOutput:
    """
    Make decision with circuit breaker protection.

    Args:
        confidence_score: Confidence score
        deliverability_score: Deliverability score
        spam_flags: List of spam flags
        analyzer_needs_review: Whether analyzer flagged for review
        fallback_result: Optional fallback if circuit is open

    Returns:
        GatekeeperOutput
    """
    from email_agents import make_decision

    async def _call():
        return await make_decision(
            confidence_score=confidence_score,
            deliverability_score=deliverability_score,
            spam_flags=spam_flags,
            analyzer_needs_review=analyzer_needs_review,
        )

    async def _fallback(*args, **kwargs):
        if fallback_result:
            logger.warn("Using fallback result for gatekeeper decision", agent="Gatekeeper")
            return fallback_result
        # Default to needs_review when circuit is open for safety
        return GatekeeperOutput(
            final_status="needs_review",
            reasoning="OpenAI service temporarily unavailable. Email marked for manual review.",
        )

    return await openai_circuit_breaker.call(
        _call,
        fallback=_fallback,
    )


# Convenience function to check if circuit breaker is healthy
def is_openai_healthy() -> bool:
    """Check if OpenAI circuit breaker is in CLOSED state."""
    from circuit_breaker import CircuitState
    return openai_circuit_breaker.state == CircuitState.CLOSED


def get_openai_status() -> dict:
    """Get OpenAI circuit breaker status."""
    return openai_circuit_breaker.get_status()
