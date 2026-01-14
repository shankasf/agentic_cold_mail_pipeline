"""
Email Writer Agent
Generates short, personalized cold emails for booking demos.
"""
from agents import Agent
from schemas import EmailWriterOutput
import config

INSTRUCTIONS = f"""You are an expert cold email copywriter. Your task is to write short, personalized cold emails that book demos.

SENDER IDENTITY:
- Name: {config.SENDER_NAME}
- Title: {config.SENDER_TITLE}
- Company: {config.COMPANY_NAME} - AI Voice Agents for businesses
- Email: {config.SENDER_EMAIL}

EMAIL STRUCTURE (70-110 words total, excluding signature):
1. OPENING (1 line): Reference ONE fact about their business from the provided evidence
2. VALUE (1-2 lines): Explain how AI voice agents help businesses like theirs
3. CTA (1 line): Clear call-to-action to book a demo with the Calendly link
4. SIGNATURE: Must end EXACTLY like this:

Best regards,
{config.SENDER_NAME}
{config.SENDER_TITLE}
{config.COMPANY_NAME}

CALENDLY LINK: {config.CALENDLY_URL}

CRITICAL RULES:
- Word count: EXACTLY 70-110 words (NOT counting signature block)
- Include the phrase "book a demo" near the CTA
- Include the Calendly link EXACTLY ONCE in the CTA - no other links allowed
- ALWAYS end with the exact signature block shown above
- NO unsubscribe text or link
- NO spammy language (avoid: "amazing", "incredible", "don't miss out", multiple exclamation points)
- Personalization must use ONLY facts from the provided evidence
- Keep it conversational and professional
- Subject line: 5-10 words, personalized, no spam triggers

GOOD SUBJECT EXAMPLES:
- "Quick question about [Company]'s phone support"
- "AI voice agents for [Industry] businesses"
- "Idea for [Company]'s customer calls"

BAD SUBJECT EXAMPLES (AVOID):
- "You won't believe this opportunity!!!"
- "URGENT: Limited time offer"
- "Free consultation inside!"
"""

email_writer_agent = Agent(
    name="EmailWriter",
    instructions=INSTRUCTIONS,
    model=config.OPENAI_MODEL,
    output_type=EmailWriterOutput,
)


async def write_email(
    business: dict,
    contact: dict,
    facts_used: list[dict],
    pain_point: str | None = None,
    industry_playbook: dict | None = None
) -> EmailWriterOutput:
    """
    Generate a cold email for a business/contact.

    Args:
        business: {canonicalName, website, industryGuess, location}
        contact: {email, name, role}
        facts_used: List of {type, value, chunk_id, confidence}
        pain_point: Optional inferred pain point
        industry_playbook: Optional playbook for the industry

    Returns:
        EmailWriterOutput with subject and body_text
    """
    from agents import Runner

    # Format business info
    contact_name = contact.get('name') or 'there'
    business_name = business.get('canonical_name', 'your company')

    # Format facts
    facts_text = "\n".join([
        f"- {f['type']}: {f['value']} (confidence: {f['confidence']}%)"
        for f in facts_used
    ])

    # Format playbook hints
    hints = ""
    if industry_playbook:
        value_props = industry_playbook.get('valueProps', [])[:2]
        if value_props:
            hints = f"\nValue propositions to consider: {', '.join(value_props)}"

    pain_text = f"\nInferred pain point: {pain_point}" if pain_point else ""

    prompt = f"""Write a cold email to book a demo.

RECIPIENT:
- Contact: {contact_name}
- Email: {contact.get('email')}
- Role: {contact.get('role', 'N/A')}
- Business: {business_name}
- Industry: {business.get('industry_guess', 'N/A')}
- Location: {business.get('location', 'N/A')}

FACTS TO USE FOR PERSONALIZATION (use at least one):
{facts_text}
{pain_text}
{hints}

Remember:
- 70-110 words ONLY (not counting signature)
- Include "book a demo" in CTA
- Include Calendly link exactly once: {config.CALENDLY_URL}
- MUST end with signature:
  Best regards,
  {config.SENDER_NAME}
  {config.SENDER_TITLE}
  {config.COMPANY_NAME}
- NO unsubscribe text
- NO spam language
- Subject: 5-10 words, personalized"""

    result = await Runner.run(email_writer_agent, prompt)
    return result.final_output_as(EmailWriterOutput)
