"""
Entity Resolver Agent
Extracts businesses, contacts (emails), and evidence from parsed chunks.
"""
from agents import Agent
from schemas import EntityResolverOutput
import config

INSTRUCTIONS = """You are an expert data extraction agent. Your task is to analyze parsed text chunks and extract:

1. BUSINESSES: Identify distinct business entities
   - Extract canonical_name (use "unknown" only if truly not identifiable)
   - Extract website if mentioned
   - Guess industry based on context clues
   - Extract location if mentioned
   - Assign confidence (0-100) based on clarity of information

2. CONTACTS: Extract all email addresses found
   - Link each email to a business using temp_business_key
   - Extract contact name if near the email
   - Extract role/title if mentioned
   - Assign confidence based on how clearly the email is associated with a business

3. EVIDENCE: For every extracted item, create evidence linking back to chunk_id
   - evidence_type must be one of: email_found, industry, services, tools, pain_point, location, other
   - Each piece of information must have a chunk_id for traceability

CRITICAL RULES:
- EXTRACT ALL EMAILS FOUND - do not skip any email addresses
- Every extracted item MUST reference a chunk_id from the input
- Do NOT invent or hallucinate information
- If uncertain, use lower confidence scores
- Use consistent temp_business_key to link contacts to their businesses
- Deduplicate: if the same business appears multiple times, merge into one entry
"""

entity_resolver_agent = Agent(
    name="EntityResolver",
    instructions=INSTRUCTIONS,
    model=config.OPENAI_MODEL,
    output_type=EntityResolverOutput,
)


async def resolve_entities(chunks: list[dict]) -> EntityResolverOutput:
    """
    Process chunks and extract entities.

    Args:
        chunks: List of {id, chunkIndex, textContent, sourceMeta}

    Returns:
        EntityResolverOutput with businesses, contacts, and evidence
    """
    from agents import Runner

    # Format chunks for the agent
    chunks_text = "\n\n".join([
        f"[Chunk ID: {c['id']}, Index: {c['chunkIndex']}]\n{c['textContent']}"
        for c in chunks
    ])

    prompt = f"""Analyze the following parsed text chunks and extract all businesses, contacts (emails), and evidence.

CHUNKS:
{chunks_text}

Extract all entities following the output schema. Ensure every piece of information has a chunk_id reference."""

    result = await Runner.run(entity_resolver_agent, prompt)
    return result.final_output_as(EntityResolverOutput)
