"""
Template Generator Agent
Generates professional email templates from business information in uploaded files.
Ensures templates pass spam filters and are ready for personalization.
"""
from agents import Agent
from pydantic import BaseModel, Field
from typing import Optional
import config


class GeneratedTemplate(BaseModel):
    """A generated email template."""
    name: str = Field(description="Descriptive name for this template")
    subject_template: str = Field(description="Email subject with {{variables}} for personalization")
    body_template: str = Field(description="Complete email body including signature. MUST end with: Best regards,\\nSagar Shankaran\\nFounder, Callsphere")
    description: str = Field(description="Brief description of when to use this template")


class TemplateGeneratorOutput(BaseModel):
    """Output from the Template Generator Agent."""
    template: GeneratedTemplate = Field(description="The generated template")
    insights: str = Field(description="Brief explanation of the approach taken")


CALENDLY_LINK = "https://calendly.com/sagar-callsphere/new-meeting"

INSTRUCTIONS = f"""You are an expert email marketing copywriter specializing in B2B outreach. Your task is to generate ONE professional email template based on the user's stated PURPOSE.

1. PASS SPAM FILTERS - Critical requirements:
   - NO spammy phrases: "act now", "limited time", "don't miss", "guaranteed", "free", "urgent"
   - NO excessive punctuation (multiple exclamation points)
   - NO ALL CAPS words
   - Professional, conversational tone
   - Clear value proposition without being salesy

2. USE PERSONALIZATION VARIABLES:
   - {{{{first_name}}}} - Contact's first name (use this for greeting, e.g., "Hi {{{{first_name}}}},")
   - {{{{company}}}} - Company name
   - {{{{industry}}}} - Industry type
   - {{{{role}}}} - Contact's job role

3. FOLLOW EMAIL BEST PRACTICES:
   - Subject: 5-10 words, personalized, curiosity-driven (no spam triggers)
   - Body: 70-110 words (not counting signature)
   - ALWAYS end with a call-to-action asking to book a call with this exact link: {CALENDLY_LINK}
   - Include phrase like "book a quick call" or "schedule a brief chat" near the CTA
   - ALWAYS end with this exact signature block:

     Best regards,
     Sagar Shankaran
     Founder, Callsphere

4. ALIGN WITH USER'S PURPOSE:
   - Focus the template content on achieving the user's stated goal
   - Use appropriate tone and messaging for the purpose
   - Tailor the call-to-action to match the objective

5. USE CONTEXT INSIGHTS (if provided):
   - Extract key business pain points from any context
   - Identify industry-specific language and terminology
   - Tailor value propositions to the context

Generate exactly ONE template that best achieves the user's purpose.

GOOD SUBJECT EXAMPLES:
- "Quick question about {{{{company}}}}'s customer support"
- "Idea for {{{{company}}}}'s {{{{industry}}}} operations"
- "{{{{first_name}}}}, saw your recent expansion news"

BAD SUBJECT EXAMPLES (AVOID):
- "URGENT: Don't miss this opportunity!!!"
- "FREE consultation - Limited time only"
- "You won't believe what we can do"

REQUIRED CTA FORMAT (use at end of body before signature):
Would love to chat - here's my calendar: {CALENDLY_LINK}

CRITICAL: The body_template output MUST include the complete signature at the very end:

Best regards,
Sagar Shankaran
Founder, Callsphere

DO NOT omit the signature. Every email body MUST end with these exact 3 lines.
"""

template_generator_agent = Agent(
    name="TemplateGenerator",
    instructions=INSTRUCTIONS,
    model=config.OPENAI_MODEL,
    output_type=TemplateGeneratorOutput,
)


async def generate_templates(
    purpose: str,
    document_content: str | None = None,
    context_hints: dict | None = None
) -> TemplateGeneratorOutput:
    """
    Generate email templates based on user's purpose.

    Args:
        purpose: The user's stated purpose/goal for these templates
        document_content: Optional text content for additional context
        context_hints: Optional additional context about the business

    Returns:
        TemplateGeneratorOutput with generated templates and insights
    """
    from agents import Runner

    # Build context section
    context = ""
    if context_hints:
        if context_hints.get('industry'):
            context += f"\nTarget Industry: {context_hints['industry']}"
        if context_hints.get('company_type'):
            context += f"\nCompany Type: {context_hints['company_type']}"
        if context_hints.get('pain_points'):
            context += f"\nKnown Pain Points: {', '.join(context_hints['pain_points'])}"

    document_section = ""
    if document_content:
        document_section = f"""

ADDITIONAL CONTEXT:
{document_content[:8000]}
"""

    prompt = f"""Generate ONE professional email template for the following PURPOSE:

PURPOSE: {purpose}
{context}
{document_section}

Create a single template that best achieves this purpose. The template MUST:
1. Be aligned with the stated purpose
2. Use personalization variables: {{{{first_name}}}} for greeting, {{{{company}}}}, {{{{industry}}}}, {{{{role}}}}
3. Be 70-110 words (body only, not counting signature)
4. Include a CTA asking to book a call with this exact link: {CALENDLY_LINK}
5. Pass all spam filter checks
6. Be professional yet conversational

CRITICAL - The body_template MUST end with this EXACT signature (include these 3 lines at the very end):

Best regards,
Sagar Shankaran
Founder, Callsphere

DO NOT forget the signature. It is REQUIRED.

Also provide a brief insight about the approach taken."""

    result = await Runner.run(template_generator_agent, prompt)
    return result.final_output_as(TemplateGeneratorOutput)
