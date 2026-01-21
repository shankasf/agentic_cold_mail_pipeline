"""
Column Mapper Agent
Intelligently maps raw file column names to the target schema fields.
Uses semantic understanding to handle variations like "Company Name" = "Business Name".
"""
from agents import Agent
from schemas import ColumnMapperOutput
import config

INSTRUCTIONS = """You are an expert data mapping specialist. Your task is to analyze CSV/Excel column names and automatically map them to a standardized business contact schema.

TARGET SCHEMA FIELDS:
- email: Email address of the contact (required)
- business_name: Name of the business/company/organization (required)
- website: Business website URL
- industry: Business industry, sector, or category
- location: Business address, city, region, or country
- contact_name: Name of the contact person
- role: Job title, position, or role of the contact

YOUR TASK:
Analyze each source column name and determine which target schema field it maps to.

MAPPING GUIDELINES:
1. SEMANTIC UNDERSTANDING - Understand the meaning, not just keywords:
   - "Company Name", "Business Name", "Organization", "Firm", "Account Name" → business_name
   - "Email", "E-mail", "Contact Email", "Work Email", "Mail" → email
   - "Website", "URL", "Homepage", "Domain", "Web Address" → website
   - "Industry", "Sector", "Vertical", "Business Type", "Category" → industry
   - "Location", "Address", "City", "Region", "Country", "HQ", "Headquarters" → location
   - "Contact Name", "Person", "First Name", "Full Name", "Representative" → contact_name
   - "Role", "Title", "Position", "Job Title", "Designation" → role

2. HANDLE VARIATIONS:
   - Ignore case: "EMAIL" = "email" = "Email"
   - Ignore separators: "company_name" = "company-name" = "company name" = "companyname"
   - Handle abbreviations: "org" = "organization", "co" = "company"
   - Handle suffixes: "Business Name (required)" → business_name

3. USE SAMPLE DATA to disambiguate when column names are ambiguous:
   - A column named "Name" with values like "John Smith" → contact_name
   - A column named "Name" with values like "Acme Corp" → business_name
   - A column with email-like values → email (even if column name is unclear)

4. CONFIDENCE SCORING:
   - 90-100: Perfect match (e.g., "email" → email)
   - 70-89: Strong semantic match (e.g., "Company Name" → business_name)
   - 50-69: Reasonable inference from sample data
   - Below 50: Uncertain, mark as unmapped

5. UNMAPPED COLUMNS:
   - If a column doesn't clearly map to any schema field, mark target_field as "unmapped"
   - Include in unmapped_columns list with explanation

CRITICAL RULES:
- NEVER guess without evidence from column name or sample data
- If two columns could map to the same field, pick the best one and warn about the other
- Prioritize required fields (email, business_name) - be more lenient in mapping these
- Explain your reasoning for each mapping
"""

column_mapper_agent = Agent(
    name="ColumnMapper",
    instructions=INSTRUCTIONS,
    model=config.OPENAI_MODEL,
    output_type=ColumnMapperOutput,
)


async def map_columns(
    headers: list[str],
    sample_rows: list[dict] | None = None,
    max_samples: int = 5
) -> ColumnMapperOutput:
    """
    Intelligently map source columns to target schema fields.

    Args:
        headers: List of column names from the uploaded file
        sample_rows: Optional list of sample data rows for disambiguation
        max_samples: Maximum number of sample rows to include (default 5)

    Returns:
        ColumnMapperOutput with mappings, unmapped columns, and warnings
    """
    from agents import Runner

    # Build the prompt
    prompt_parts = [
        "Analyze these CSV/Excel columns and map them to the target schema fields.",
        "",
        f"SOURCE COLUMNS: {headers}",
    ]

    # Add sample data if provided
    if sample_rows and len(sample_rows) > 0:
        prompt_parts.append("")
        prompt_parts.append("SAMPLE DATA (first few rows):")
        for i, row in enumerate(sample_rows[:max_samples]):
            # Format each row showing column: value pairs
            row_str = ", ".join([f"{k}: '{v}'" for k, v in row.items() if v])
            prompt_parts.append(f"  Row {i + 1}: {row_str}")

    prompt_parts.extend([
        "",
        "Map each source column to a target schema field. Provide confidence scores and reasoning.",
        "If a column cannot be mapped, set target_field to 'unmapped' and include it in unmapped_columns.",
    ])

    prompt = "\n".join(prompt_parts)

    result = await Runner.run(column_mapper_agent, prompt)
    return result.final_output_as(ColumnMapperOutput)


def get_mapping_dict(mapper_output: ColumnMapperOutput, min_confidence: int = 50) -> dict[str, str]:
    """
    Convert ColumnMapperOutput to a simple dict for use in data processing.

    Args:
        mapper_output: Output from map_columns()
        min_confidence: Minimum confidence to include mapping (default 50)

    Returns:
        Dict mapping source_column -> target_field
    """
    return {
        m.source_column: m.target_field
        for m in mapper_output.mappings
        if m.target_field != "unmapped" and m.confidence >= min_confidence
    }
