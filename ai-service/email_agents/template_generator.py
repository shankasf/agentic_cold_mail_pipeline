"""
Template Generator Agent
Generates professional email templates for bulk personalization.
Follows strict formatting rules - no links, plain text only.
"""
from agents import Agent
from pydantic import BaseModel, Field
import config


class GeneratedTemplate(BaseModel):
    """A generated email template."""
    name: str = Field(description="Descriptive name for this template")
    subject_template: str = Field(description="Email subject with {{variables}} - 2-4 words, lowercase, no questions")
    body_template: str = Field(description="Complete email body with {{variables}}. 100-140 words. Must end with: Best,\\n" + config.SENDER_NAME)
    description: str = Field(description="Brief description of when to use this template")


class TemplateGeneratorOutput(BaseModel):
    """Output from the Template Generator Agent."""
    template: GeneratedTemplate = Field(description="The generated template")
    insights: str = Field(description="Brief explanation of the approach taken")


INSTRUCTIONS = f"""You are an expert email template creator for cold outreach.
Create templates that sound like a founder thinking out loud, not a salesperson.

=== AVAILABLE VARIABLES ===
- {{{{first_name}}}} - Contact's first name (use in greeting)
- {{{{company}}}} - Company name
- {{{{industry}}}} - Industry type
- {{{{role}}}} - Contact's job role
- {{{{pain_theme}}}} - Industry-specific pain point (provided at send time)

=== SUBJECT LINE RULES ===
- 2-4 words only
- All lowercase
- Sounds neutral/internal, like a teammate note
- NEVER a question
- NEVER outcome-obvious

GOOD: "manual reply math", "overnight sales", "{{{{industry}}}} ops"
BAD: "Quick question?", "AI for your business", "Boost revenue"

=== BODY STRUCTURE (100-140 words) ===

1. GREETING: "Hi {{{{first_name}}}},"

2. OPENING (1 line): Founder thinking out loud
   NEVER: "Quick question:", "I came across", "I noticed you"

3. PROBLEM (2-4 short sentences):
   - Use {{{{pain_theme}}}} to make it specific
   - Paint a scene they recognize
   - One idea per sentence
   - Short sentences only

4. PRODUCT INTRO (2-3 sentences):
   - "Custom AI voice and chat agent designed for your business"
   - Max 2 supporting features, woven in naturally
   - NEVER list features

5. SETUP LINE: "Takes about 5 minutes to set up." (exactly once)

6. CTA (1 question):
   GOOD: "Want to see how it handles {{{{pain_theme}}}}?"
   BAD: "Happy to share if helpful", "Let me know if interested"

7. SIGNATURE:
Best,
{config.SENDER_NAME}

=== CRITICAL RULES ===
- NO LINKS OR URLs - plain text only
- NO em dashes (—)
- Short sentences only
- 100-140 words for body
- Sound like a founder, not a marketer

=== AVOID THESE PHRASES ===
- "I came across {{{{company}}}}"
- "I noticed you're part of"
- "Quick question"
- "Happy to share if helpful"
- "Let me know if interested"
- "If it makes sense"
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

Create a template that:
1. Uses variables: {{{{first_name}}}}, {{{{company}}}}, {{{{industry}}}}, {{{{pain_theme}}}}
2. Subject: 2-4 words, lowercase, NOT a question
3. Body: 100-140 words
4. NO LINKS - plain text only
5. NO em dashes
6. Mentions "5-minute setup" exactly once
7. CTA is a question tied to the angle (not "happy to share")
8. Sounds like a founder thinking out loud

CRITICAL - The body_template MUST end with:

Best,
{config.SENDER_NAME}

Also provide a brief insight about the approach taken."""

    result = await Runner.run(template_generator_agent, prompt)
    return result.final_output_as(TemplateGeneratorOutput)
