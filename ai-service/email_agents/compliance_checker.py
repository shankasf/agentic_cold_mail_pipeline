"""
Compliance & Deliverability Agent
Checks email for spam triggers and compliance issues.
"""
from agents import Agent
from schemas import ComplianceOutput
import config

INSTRUCTIONS = f"""You are an expert email deliverability and compliance specialist. Your task is to analyze cold emails and ensure they meet best practices.

CHECK FOR THESE ISSUES:

1. SPAM TRIGGERS (reduce score for each):
   - Multiple exclamation points
   - ALL CAPS words
   - Spammy phrases: "act now", "limited time", "don't miss", "guaranteed"
   - Too many links (should be exactly 1)
   - Wrong link (must be exactly: {config.CALENDLY_URL})
   - Missing personalization
   - Too salesy tone

2. COMPLIANCE ISSUES (major score reduction):
   - Missing required Calendly link
   - Contains unsubscribe text (NOT ALLOWED for cold outreach)
   - Contains other links besides Calendly
   - Word count outside 70-110 range

3. DELIVERABILITY CONCERNS:
   - Subject line too long (>60 chars) or too short (<10 chars)
   - Subject contains spam words
   - Body too short or too long
   - No clear call-to-action

SIGNATURE REQUIREMENTS:
- Email must end with this EXACT signature block:

Best regards,
{config.SENDER_NAME}
{config.SENDER_TITLE}
{config.COMPANY_NAME}

- The footer_text field should contain the company address: {config.BUSINESS_ADDRESS}

SCORING:
- Start at 100
- Minor issues: -5 to -10 each
- Major issues: -15 to -25 each
- Critical (wrong link, unsubscribe present): -30 to -50 each

OUTPUT:
- deliverability_score: 0-100
- spam_flags: List of specific issues found
- suggestions: Brief improvement suggestions if score < 80
- footer_text: The correct footer to append
"""

compliance_agent = Agent(
    name="ComplianceChecker",
    instructions=INSTRUCTIONS,
    model="gpt-4o",
    output_type=ComplianceOutput,
)


async def check_compliance(subject: str, body_text: str) -> ComplianceOutput:
    """
    Check email for compliance and deliverability issues.

    Args:
        subject: Email subject line
        body_text: Email body

    Returns:
        ComplianceOutput with score, flags, and footer
    """
    from agents import Runner

    # Count words
    word_count = len(body_text.split())

    # Check for Calendly link
    has_calendly = config.CALENDLY_URL in body_text

    prompt = f"""Analyze this cold email for compliance and deliverability:

SUBJECT: {subject}
(Length: {len(subject)} chars)

BODY:
{body_text}

Word count: {word_count}
Contains Calendly link: {has_calendly}
Required Calendly URL: {config.CALENDLY_URL}

Check for all spam triggers, compliance issues, and deliverability concerns.
Generate the correct footer text and provide your assessment."""

    result = await Runner.run(compliance_agent, prompt)
    return result.final_output_as(ComplianceOutput)
