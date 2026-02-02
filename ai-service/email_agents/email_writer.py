"""
Email Writer Agent
Generates short, personalized cold emails that start conversations.
Follows strict formatting rules for maximum deliverability and engagement.
"""
import random
from agents import Agent
from schemas import EmailWriterOutput
import config

# Opening types to rotate randomly
OPENING_TYPES = [
    "observation",      # Notice something specific about their business
    "hypothesis",       # Pose a theory about their situation
    "micro-story",      # Brief 1-sentence story about similar company
    "data-discovery",   # Share a surprising data point
    "casual",           # Relaxed, conversational opener
    "direct",           # Get straight to the point
]

INSTRUCTIONS = f"""You write short, punchy cold emails. One specific pain point. No fluff.

SENDER: {config.SENDER_NAME}

=== SUBJECT LINE (CRITICAL) ===
- 2-4 words, lowercase
- Reference THEIR specific situation (industry, role, or pain)
- Sound like internal note, not marketing
- NEVER generic ("customer engagement", "quick thought")
- NEVER questions

EXAMPLES BY INDUSTRY:
- Plumber: "after hours calls", "weekend leads"
- Restaurant: "reservation backlog", "table turnover"
- Dental: "no-show rate", "recall gaps"
- Retail: "cart abandons", "holiday staffing"
- Agency: "client response time", "lead qualification"

=== EMAIL BODY (60-80 words MAX) ===

STRUCTURE:
1. "Hi [Name],"

2. PAIN POINT (2 sentences max):
   - State ONE specific problem they likely have
   - Be concrete: numbers, scenarios, consequences
   - Use industry knowledge if no data provided

3. SOLUTION (1 sentence):
   - How we solve that ONE problem
   - No jargon, no feature lists

4. CTA (1 short question):
   - "Worth exploring?"
   - "Dealing with this?"
   - "Am I off?"

5. "Best,\\n{config.SENDER_NAME}"

=== SPAM TRIGGERS TO AVOID ===
NEVER use these phrases:
- "5 minutes to set up" / any setup time claims
- "custom AI" / "AI-powered" / "AI solution"
- "voice and chat agent"
- "streamline" / "optimize" / "leverage"
- "I was thinking about"
- "It's exciting to see"
- "Does this align with"
- "I came across" / "I noticed"
- "reach out" / "touch base"
- "game-changer" / "revolutionary"
- Any percentage claims without source
- "Limited time" / urgency language

INSTEAD say:
- "handles your calls" not "AI voice agent"
- "answers questions automatically" not "chat automation"
- "we built something" not "our solution"

=== TONE ===
- Casual, like texting a colleague
- Short sentences. Fragments OK.
- No corporate speak
- Empathy over features
- Sound curious, not salesy

=== CRITICAL ===
- 60-80 words ONLY (excluding greeting/signature)
- ONE pain point per email
- Subject must be UNIQUE to their business/industry
- If no company data, use industry-specific pain points
"""

email_writer_agent = Agent(
    name="EmailWriter",
    instructions=INSTRUCTIONS,
    model=config.OPENAI_MODEL,
    output_type=EmailWriterOutput,
)


def format_custom_data(custom_data: dict | None) -> str:
    """Format custom data fields into a readable context section."""
    if not custom_data or not isinstance(custom_data, dict):
        return ""

    # Filter out empty values and format nicely
    items = []
    for key, value in custom_data.items():
        if value and str(value).strip():
            # Convert snake_case to Title Case for display
            display_key = key.replace('_', ' ').title()
            items.append(f"- {display_key}: {value}")

    if not items:
        return ""

    return "\n".join(items)


async def write_email(
    business: dict,
    contact: dict,
    facts_used: list[dict],
    pain_point: str | None = None,
    industry_playbook: dict | None = None,
    custom_business_data: dict | None = None,
    custom_contact_data: dict | None = None,
) -> EmailWriterOutput:
    """
    Generate a cold email for a business/contact.

    Args:
        business: {canonicalName, website, industryGuess, location}
        contact: {email, name, role}
        facts_used: List of {type, value, chunk_id, confidence}
        pain_point: Optional inferred pain point
        industry_playbook: Optional playbook for the industry
        custom_business_data: ALL extra columns from import (for AI to scan and use)
        custom_contact_data: ALL extra contact columns from import

    Returns:
        EmailWriterOutput with subject and body_text
    """
    from agents import Runner

    # Format business info
    contact_name = contact.get('name') or 'there'
    first_name = contact_name.split()[0] if contact_name != 'there' else 'there'
    business_name = business.get('canonical_name', 'your company')
    industry = business.get('industry_guess', 'Unknown')

    # Format facts from evidence
    facts_text = "\n".join([
        f"- {f['type']}: {f['value']} (confidence: {f['confidence']}%)"
        for f in facts_used
    ]) if facts_used else "No specific facts from evidence"

    # Extract platforms/tools from facts
    platforms = [f['value'] for f in facts_used if f['type'].lower() in ['tools', 'platform', 'software', 'crm', 'services']]
    platforms_text = f"\nPlatforms/Tools found: {', '.join(platforms)}" if platforms else "\nNo specific platforms/tools identified - do NOT mention any"

    # Randomly select opening type
    opening_type = random.choice(OPENING_TYPES)

    pain_text = f"\nInferred pain point: {pain_point}" if pain_point else ""

    # Role context
    role_context = ""
    if contact.get('role'):
        role_context = f"\n- Their Role: {contact.get('role')}"

    location_context = ""
    if business.get('location'):
        location_context = f"\n- Location: {business.get('location')}"

    # Format ALL custom data from import (could be 50+ columns)
    custom_business_text = format_custom_data(custom_business_data)
    custom_contact_text = format_custom_data(custom_contact_data)

    # Build additional context section
    additional_context = ""
    if custom_business_text or custom_contact_text:
        additional_context = "\n\n=== ADDITIONAL DATA FROM IMPORT (scan for useful personalization hooks) ==="
        if custom_business_text:
            additional_context += f"\n\nCompany Data:\n{custom_business_text}"
        if custom_contact_text:
            additional_context += f"\n\nContact Data:\n{custom_contact_text}"
        additional_context += "\n\nSCAN the above data for ANY useful personalization hooks like: revenue, employee count, funding, tech stack, recent news, awards, pain points, interests, etc. Use what's relevant to create a more personalized email."

    # Industry knowledge prompt when data is sparse
    ai_knowledge_prompt = ""
    if not facts_used and not custom_business_text:
        ai_knowledge_prompt = f"""

=== USE YOUR KNOWLEDGE ===
Since no specific company data is available, use your general knowledge about:
- Typical pain points for {industry} companies
- Common challenges businesses like {business_name} face
- Industry trends and patterns that would resonate

Create a relevant, helpful email based on industry best practices."""

    prompt = f"""Write a SHORT cold email. 60-80 words max. One pain point only.

=== RECIPIENT ===
- Name: {first_name}
- Company: {business_name}
- Industry: {industry}{role_context}{location_context}

=== AVAILABLE DATA ===
{facts_text}
{platforms_text}
{pain_text}{additional_context}{ai_knowledge_prompt}

=== YOUR TASK ===

1. SUBJECT (2-4 words, lowercase):
   - Must relate to THEIR industry or situation
   - Examples for {industry}: think about their specific daily problems
   - NOT generic like "customer engagement" or "quick thought"

2. BODY (60-80 words STRICT LIMIT):

   Hi {first_name},

   [PAIN - 2 sentences: State ONE specific problem for {industry} businesses. Be concrete.]

   [SOLUTION - 1 sentence: How we help. No jargon.]

   [CTA - Short question: "Worth exploring?" / "Dealing with this?" / "Am I off?"]

   Best,
   {config.SENDER_NAME}

=== DO NOT USE ===
- "AI" / "automation" / "streamline" / "optimize"
- "5 minutes" / setup time claims
- "I noticed" / "I came across" / "exciting"
- Feature lists or bullet points
- More than 80 words"""

    result = await Runner.run(email_writer_agent, prompt)
    return result.final_output_as(EmailWriterOutput)
