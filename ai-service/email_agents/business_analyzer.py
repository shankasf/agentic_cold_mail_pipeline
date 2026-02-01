"""
Business Analyzer Agent
Analyzes a business and its evidence to extract facts for personalization.
Identifies pain themes based on industry and extracts platforms/tools used.
"""
from agents import Agent
from schemas import BusinessAnalyzerOutput
import config

# Industry-specific pain themes mapping
INDUSTRY_PAIN_THEMES = {
    "healthcare": [
        "missed patient calls after hours",
        "appointment no-shows and scheduling chaos",
        "staff overwhelmed with routine inquiries",
        "long hold times frustrating patients",
    ],
    "dental": [
        "missed appointment requests after hours",
        "staff juggling phones and patients",
        "no-shows eating into revenue",
        "new patient calls going to voicemail",
    ],
    "legal": [
        "potential clients calling after hours",
        "intake calls interrupting billable work",
        "missed calls from leads who won't call back",
        "staff screening calls instead of legal work",
    ],
    "real estate": [
        "leads calling when you're showing properties",
        "after-hours inquiries from serious buyers",
        "missing calls during open houses",
        "competitors answering faster",
    ],
    "hvac": [
        "emergency calls at 2am going to voicemail",
        "dispatching delays costing jobs",
        "seasonal call spikes overwhelming staff",
        "technicians missing dispatch updates",
    ],
    "plumbing": [
        "emergency calls missed overnight",
        "customers hanging up after long holds",
        "office staff buried in scheduling",
        "weekend calls going unanswered",
    ],
    "roofing": [
        "storm leads calling all at once",
        "missing calls while on job sites",
        "seasonal demand spikes overwhelming phones",
        "competitors getting to leads first",
    ],
    "insurance": [
        "quote requests sitting in voicemail",
        "renewals requiring manual follow-up",
        "claims calls overwhelming staff",
        "after-hours policy questions unanswered",
    ],
    "financial services": [
        "high-value leads going to voicemail",
        "compliance requirements slowing response",
        "advisors interrupted by routine calls",
        "after-hours inquiries from busy professionals",
    ],
    "e-commerce": [
        "order status calls overwhelming support",
        "cart abandonment with no follow-up",
        "returns and exchanges creating backlogs",
        "international customers in different timezones",
    ],
    "saas": [
        "trial users churning without engagement",
        "support tickets piling up",
        "onboarding calls not getting scheduled",
        "enterprise leads expecting immediate response",
    ],
    "agency": [
        "client calls interrupting creative work",
        "new business inquiries going cold",
        "project status updates consuming hours",
        "after-hours requests from demanding clients",
    ],
    "default": [
        "valuable leads going to voicemail",
        "staff overwhelmed with routine calls",
        "after-hours inquiries left unanswered",
        "response time slower than competitors",
    ],
}

INSTRUCTIONS = """You are an expert business analyst specializing in B2B outreach research.

YOUR TASK: Analyze a business and its evidence to extract facts for email personalization.

1. SELECT UP TO 3 FACTS for email personalization:
   - Each fact must be directly supported by the provided evidence
   - Each fact must include chunk_id for traceability
   - Assign confidence (0-100) based on how clearly the evidence supports the fact
   - Prioritize facts about: platforms/tools used, services offered, company size, specific challenges

2. IDENTIFY PLATFORMS/TOOLS:
   - Look for CRM systems (Salesforce, HubSpot, Zoho, etc.)
   - Look for communication tools (phone systems, chat widgets, Zendesk, Intercom, etc.)
   - Look for scheduling tools (Calendly, Acuity, etc.)
   - ONLY mention platforms explicitly found in evidence - never assume or add extras

3. INFER A PAIN POINT:
   - Select a pain theme that matches their industry
   - Ground it in specific evidence about their business
   - Make it concrete and relatable to their situation

4. DETERMINE IF REVIEW IS NEEDED:
   - Set needs_review=true if fewer than 2 facts have confidence >= 70
   - Set needs_review=true if the business information is too vague

CRITICAL RULES:
- NEVER INVENT FACTS - only use information directly from evidence
- NEVER ADD platforms/tools not explicitly mentioned in evidence
- Each fact MUST have a valid chunk_id
- Be conservative with confidence scores
- Quality over quantity - 2 solid facts are better than 3 weak ones
"""

business_analyzer_agent = Agent(
    name="BusinessAnalyzer",
    instructions=INSTRUCTIONS,
    model=config.OPENAI_MODEL,
    output_type=BusinessAnalyzerOutput,
)


def get_pain_themes_for_industry(industry: str | None) -> list[str]:
    """Get relevant pain themes for an industry."""
    if not industry:
        return INDUSTRY_PAIN_THEMES["default"]

    industry_lower = industry.lower()

    # Try exact match first
    if industry_lower in INDUSTRY_PAIN_THEMES:
        return INDUSTRY_PAIN_THEMES[industry_lower]

    # Try partial match
    for key, themes in INDUSTRY_PAIN_THEMES.items():
        if key in industry_lower or industry_lower in key:
            return themes

    return INDUSTRY_PAIN_THEMES["default"]


async def analyze_business(
    business: dict,
    evidence: list[dict],
    chunks: list[dict],
    industry_playbook: dict | None = None
) -> BusinessAnalyzerOutput:
    """
    Analyze a business using its evidence.

    Args:
        business: {id, canonical_name, website, industry_guess, location}
        evidence: List of {id, evidence_type, extracted_value, chunk_id, confidence}
        chunks: List of {id, textContent} for context
        industry_playbook: Optional existing playbook for the industry

    Returns:
        BusinessAnalyzerOutput with facts_used, pain_point, etc.
    """
    from agents import Runner

    industry = business.get('industry_guess', '')
    pain_themes = get_pain_themes_for_industry(industry)

    # Format business info
    business_info = f"""
Business: {business.get('canonical_name', 'Unknown')}
Website: {business.get('website', 'N/A')}
Industry: {industry or 'N/A'}
Location: {business.get('location', 'N/A')}
"""

    # Format evidence
    evidence_text = "\n".join([
        f"- [{e['evidence_type']}] {e['extracted_value']} (chunk: {e['chunk_id']}, confidence: {e['confidence']})"
        for e in evidence
    ])

    # Format relevant chunks
    chunk_map = {c['id']: c['textContent'] for c in chunks}
    chunks_text = "\n\n".join([
        f"[Chunk {cid}]: {chunk_map.get(cid, 'N/A')[:500]}"
        for e in evidence
        if (cid := e.get('chunk_id')) and cid in chunk_map
    ])

    # Format pain themes for this industry
    pain_themes_text = "\n".join([f"- {theme}" for theme in pain_themes])

    # Format playbook if available
    playbook_text = ""
    if industry_playbook:
        playbook_text = f"""
Existing Industry Playbook for {industry_playbook.get('industry', 'Unknown')}:
- Pain Points: {', '.join(industry_playbook.get('commonPainPoints', []))}
- Value Props: {', '.join(industry_playbook.get('valueProps', []))}
"""

    prompt = f"""Analyze this business and extract facts for email personalization.

{business_info}

EVIDENCE:
{evidence_text}

RELEVANT CHUNKS:
{chunks_text}

INDUSTRY-SPECIFIC PAIN THEMES TO CONSIDER:
{pain_themes_text}

{playbook_text}

YOUR TASK:
1. Select up to 3 facts with evidence (prioritize platforms/tools found)
2. Identify any platforms/tools explicitly mentioned (CRM, phone system, chat, scheduling, etc.)
3. Infer a pain point grounded in evidence AND relevant to their industry
4. Determine if review is needed

IMPORTANT:
- Only mention platforms/tools that are EXPLICITLY found in the evidence
- Never add tools like "phone systems" or "CRM" unless evidence specifically mentions them
- Ground the pain point in their specific situation, not generic industry problems"""

    result = await Runner.run(business_analyzer_agent, prompt)
    return result.final_output_as(BusinessAnalyzerOutput)
