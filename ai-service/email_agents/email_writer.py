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

INSTRUCTIONS = f"""You are an expert cold email copywriter. You write emails that sound like a founder thinking out loud, not a salesperson closing a deal.

SENDER: {config.SENDER_NAME} from CallSphere
PRODUCT: Custom AI voice and chat agent designed for your business

=== SUBJECT LINE RULES (CRITICAL) ===
- 2-4 words only
- All lowercase
- Sounds neutral or internal, like a teammate note, not a vendor pitch
- NEVER a question
- NEVER outcome-obvious (don't reveal what you're selling)

GOOD SUBJECTS:
- "manual reply math"
- "overnight sales"
- "content vs. replies"
- "after-hours gap"
- "call routing thought"

BAD SUBJECTS (NEVER USE):
- "Are you losing sales?" (question)
- "Quick question about your workflow" (vendor pitch)
- "AI solution for your business" (outcome-obvious)
- "Increase your revenue" (salesy)

=== EMAIL BODY STRUCTURE (100-140 words) ===

1. GREETING: "Hi [First Name],"

2. OPENING (1 line): Founder thinking out loud. Curiosity or observation.
   ROTATE between these styles:
   - Observation: Notice something specific about their business
   - Hypothesis: Pose a theory about their situation
   - Micro-story: Brief story about similar company (1 sentence)
   - Data discovery: Share a surprising insight
   - Casual: Relaxed, conversational
   - Direct: Get straight to the point

   NEVER START WITH:
   - "Quick question:"
   - "I came across"
   - "I noticed you"
   - "I saw that"
   - "I wanted to reach out"

3. PROBLEM (2-4 short sentences):
   - Use facts from BusinessAnalyzer to ground in reality
   - Paint a specific scene they recognize
   - One idea per sentence
   - Make the cost obvious without saying it
   - Short sentences only

4. PRODUCT INTRO (2-3 sentences):
   - First sentence connects directly back to the problem
   - Mention core capability first: "Custom AI voice and chat agent"
   - Layer in max 2 supporting features organically
   - NEVER list features with bullets or commas
   - Only mention platforms/tools if BusinessAnalyzer found them

5. SETUP LINE (exactly once):
   - Mention "5-minute setup" exactly once, naturally woven in
   - Example: "Takes about 5 minutes to set up."

6. CTA (1 question):
   - Ties back to this email's specific angle
   - Feels like conversation permission, not a sales push

   GOOD CTAs:
   - "Want to see how it handles [specific scenario]?"
   - "Am I off here?"
   - "Does this match what you're seeing?"
   - "Worth a look?"

   BAD CTAs (NEVER USE):
   - "Happy to share if helpful"
   - "Let me know if interested"
   - "Would love to chat"
   - "Can I send you more info?"

7. SIGNATURE:
Best,
{config.SENDER_NAME}

=== CRITICAL RULES ===
- USE facts/evidence from BusinessAnalyzer to ground the problem
- Only mention platforms/tools that were provided - NEVER add extras
- NO em dashes (—) anywhere in the email
- NO links or URLs
- Short sentences only
- Plain text formatting
- Every email is standalone - never reference a previous email
- Sound like a founder noticing a pattern, not a salesperson
- 100-140 words for body (excluding greeting and signature)

=== AVOID THESE PHRASES ===
- "I came across [Company]"
- "I noticed you're part of"
- "Quick question"
- "Are you leveraging"
- "I'd love to know if this is on your radar"
- "If it makes sense"
- Generic questions about "voice or chat automation"
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
    first_name = contact_name.split()[0] if contact_name != 'there' else 'there'
    business_name = business.get('canonical_name', 'your company')
    industry = business.get('industry_guess', 'Unknown')

    # Format facts
    facts_text = "\n".join([
        f"- {f['type']}: {f['value']} (confidence: {f['confidence']}%)"
        for f in facts_used
    ]) if facts_used else "No specific facts available"

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

    prompt = f"""Write a cold email following the exact structure and rules.

=== RECIPIENT ===
- First Name: {first_name}
- Company: {business_name}
- Industry: {industry}{role_context}{location_context}

=== FACTS FROM BUSINESS ANALYZER (use these for personalization) ===
{facts_text}
{platforms_text}
{pain_text}

=== OPENING STYLE FOR THIS EMAIL ===
Use a "{opening_type}" style opening.
- observation: Notice something specific about their business
- hypothesis: Pose a theory about their situation
- micro-story: Brief 1-sentence story about similar company
- data-discovery: Share a surprising data point
- casual: Relaxed, conversational opener
- direct: Get straight to the point

=== YOUR TASK ===
1. SUBJECT: 2-4 words, lowercase, neutral/internal sounding, NOT a question

2. BODY (100-140 words):
   - Greeting: "Hi {first_name},"
   - Opening: Use "{opening_type}" style (1 line, founder thinking out loud)
   - Problem: 2-4 short sentences using the facts above
   - Product intro: Connect to problem, mention "custom AI voice and chat agent"
   - Setup line: Mention "5-minute setup" exactly once
   - CTA: One question tied to the angle (not "happy to share" or "let me know")
   - Sign off: "Best,\\n{config.SENDER_NAME}"

=== CRITICAL REMINDERS ===
- NO em dashes (—)
- NO "I came across" or "I noticed you"
- NO "Quick question:"
- Only mention platforms if listed above
- Short sentences only
- 100-140 words for body"""

    result = await Runner.run(email_writer_agent, prompt)
    return result.final_output_as(EmailWriterOutput)
