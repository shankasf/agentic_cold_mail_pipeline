"""
Gatekeeper Agent
Makes final decision on email status based on scores and thresholds.
Emails must score 85+ on deliverability to be approved.
"""
from agents import Agent
from schemas import GatekeeperOutput
import config

# Compliance threshold - emails must score 85+ to pass
COMPLIANCE_THRESHOLD = 85

INSTRUCTIONS = f"""You are the final quality gatekeeper for cold emails.
Your job is to decide if an email is ready to send or needs human review.

=== THRESHOLDS ===
- Deliverability threshold: {COMPLIANCE_THRESHOLD} (emails must score 85+ to pass)
- Confidence threshold: {config.CONFIDENCE_THRESHOLD}

=== DECISION RULES ===

APPROVE (status = "draft") if ALL conditions met:
1. deliverability_score >= {COMPLIANCE_THRESHOLD}
2. confidence_score >= {config.CONFIDENCE_THRESHOLD}
3. No critical spam flags (no links, no banned phrases)
4. Business analyzer did not flag needs_review

REQUIRE REVIEW (status = "needs_review") if ANY condition:
1. deliverability_score < {COMPLIANCE_THRESHOLD}
2. confidence_score < {config.CONFIDENCE_THRESHOLD}
3. Critical spam flags present:
   - Contains links/URLs
   - Contains em dashes
   - Uses banned opener phrases
   - Uses banned CTA phrases
   - Word count outside 100-140 range
4. Business analyzer flagged needs_review
5. Subject line issues (not 2-4 words, contains question, not lowercase)

=== OUTPUT ===
Provide:
- final_status: "draft" (ready for approval) or "needs_review" (needs human review)
- reasoning: Clear explanation of the decision

Be strict but fair. Quality emails protect sender reputation.
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
    critical_keywords = [
        'url', 'http', 'link',
        'em dash', 'em-dash',
        'banned opener', 'banned cta',
        'word count outside',
        'subject not',
        'question mark',
    ]

    critical_flags = [
        flag for flag in spam_flags
        if any(keyword in flag.lower() for keyword in critical_keywords)
    ]

    # Auto-fail conditions
    auto_fail = False
    auto_fail_reason = []

    if deliverability_score < COMPLIANCE_THRESHOLD:
        auto_fail = True
        auto_fail_reason.append(f"Deliverability score {deliverability_score} < {COMPLIANCE_THRESHOLD}")

    if critical_flags:
        auto_fail = True
        auto_fail_reason.append(f"Critical issues: {critical_flags[:3]}")

    if analyzer_needs_review:
        auto_fail = True
        auto_fail_reason.append("Business analyzer flagged for review")

    prompt = f"""Make the final decision on this email's status.

=== SCORES ===
- Confidence Score: {confidence_score}/100 (threshold: {config.CONFIDENCE_THRESHOLD})
- Deliverability Score: {deliverability_score}/100 (threshold: {COMPLIANCE_THRESHOLD})

=== FLAGS ===
- All spam flags: {spam_flags if spam_flags else 'None'}
- Critical flags detected: {critical_flags if critical_flags else 'None'}
- Business analyzer flagged for review: {analyzer_needs_review}

=== AUTO-FAIL CHECK ===
Auto-fail triggered: {auto_fail}
Reasons: {auto_fail_reason if auto_fail_reason else 'None'}

Based on these inputs, determine if this email should be:
- "draft" (ready for approval queue) - ONLY if no auto-fail and all thresholds met
- "needs_review" (requires human review) - if any issues detected

Provide clear reasoning for your decision."""

    result = await Runner.run(gatekeeper_agent, prompt)
    return result.final_output_as(GatekeeperOutput)
