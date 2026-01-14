"""
Gatekeeper Agent
Makes final decision on email status based on scores and thresholds.
"""
from agents import Agent
from schemas import GatekeeperOutput
import config

INSTRUCTIONS = f"""You are the final quality gatekeeper for cold emails. Your job is to decide if an email is ready to send or needs human review.

THRESHOLDS:
- Confidence threshold: {config.CONFIDENCE_THRESHOLD}
- Deliverability threshold: {config.DELIVERABILITY_THRESHOLD}

DECISION RULES:

APPROVE (status = "draft") if ALL conditions met:
1. confidence_score >= {config.CONFIDENCE_THRESHOLD}
2. deliverability_score >= {config.DELIVERABILITY_THRESHOLD}
3. No critical spam flags
4. Business analyzer did not flag needs_review

REQUIRE REVIEW (status = "needs_review") if ANY condition:
1. confidence_score < {config.CONFIDENCE_THRESHOLD}
2. deliverability_score < {config.DELIVERABILITY_THRESHOLD}
3. Critical spam flags present (missing link, wrong link, unsubscribe present)
4. Business analyzer flagged needs_review
5. Personalization seems weak or forced

Provide clear reasoning for your decision.
"""

gatekeeper_agent = Agent(
    name="Gatekeeper",
    instructions=INSTRUCTIONS,
    model=config.OPENAI_MODEL,
    output_type=GatekeeperOutput,
)


async def make_decision(
    confidence_score: int,
    deliverability_score: int,
    spam_flags: list[str],
    analyzer_needs_review: bool
) -> GatekeeperOutput:
    """
    Make final decision on email status.

    Args:
        confidence_score: From confidence scoring
        deliverability_score: From compliance checker
        spam_flags: From compliance checker
        analyzer_needs_review: From business analyzer

    Returns:
        GatekeeperOutput with final_status and reasoning
    """
    from agents import Runner

    # Critical flags that force review
    critical_flags = [
        flag for flag in spam_flags
        if any(word in flag.lower() for word in ['link', 'unsubscribe', 'calendly', 'missing'])
    ]

    prompt = f"""Make the final decision on this email's status.

SCORES:
- Confidence Score: {confidence_score}/100 (threshold: {config.CONFIDENCE_THRESHOLD})
- Deliverability Score: {deliverability_score}/100 (threshold: {config.DELIVERABILITY_THRESHOLD})

FLAGS:
- Spam flags: {spam_flags if spam_flags else 'None'}
- Critical flags detected: {critical_flags if critical_flags else 'None'}
- Business analyzer flagged for review: {analyzer_needs_review}

Based on these inputs, determine if this email should be:
- "draft" (ready for approval queue)
- "needs_review" (requires human review before approval)

Provide clear reasoning."""

    result = await Runner.run(gatekeeper_agent, prompt)
    return result.final_output_as(GatekeeperOutput)
