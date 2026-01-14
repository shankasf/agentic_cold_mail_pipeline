"""
Business Analyzer Agent
Analyzes a business and its evidence to extract facts for personalization.
"""
from agents import Agent
from schemas import BusinessAnalyzerOutput
import config

INSTRUCTIONS = """You are an expert business analyst. Your task is to analyze a business and its associated evidence to:

1. SELECT UP TO 3 FACTS for email personalization:
   - Each fact must be directly supported by the provided evidence
   - Each fact must include chunk_id for traceability
   - Assign confidence (0-100) based on how clearly the evidence supports the fact
   - Prefer facts about: industry, services, tools used, company size, location

2. INFER A PAIN POINT (optional):
   - Only if strongly supported by evidence
   - Must be a real business pain point that AI voice agents could solve
   - Common pain points: missed calls, after-hours inquiries, appointment scheduling, customer service overload

3. SUGGEST INDUSTRY PLAYBOOK UPDATES (optional):
   - If you discover new insights about this industry

4. DETERMINE IF REVIEW IS NEEDED:
   - Set needs_review=true if fewer than 2 facts have confidence >= 70
   - Set needs_review=true if the business information is too vague

CRITICAL RULES:
- NEVER INVENT FACTS - only use information directly from evidence
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

    # Format business info
    business_info = f"""
Business: {business.get('canonical_name', 'Unknown')}
Website: {business.get('website', 'N/A')}
Industry (guessed): {business.get('industry_guess', 'N/A')}
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

{playbook_text}

Select up to 3 facts with evidence, infer a pain point if supported, and determine if review is needed."""

    result = await Runner.run(business_analyzer_agent, prompt)
    return result.final_output_as(BusinessAnalyzerOutput)
