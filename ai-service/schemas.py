"""
Pydantic schemas for structured outputs from OpenAI agents.
All agent outputs are validated with these schemas.
"""
from typing import Optional
from pydantic import BaseModel, Field


# Entity Resolver Agent Schemas
class ExtractedBusiness(BaseModel):
    """A business entity extracted from parsed chunks."""
    temp_business_key: str = Field(description="Temporary unique key for this business")
    canonical_name: str = Field(description="The business name, or 'unknown' if not found")
    website: Optional[str] = Field(default=None, description="Business website if found")
    industry_guess: Optional[str] = Field(default=None, description="Guessed industry based on context")
    location: Optional[str] = Field(default=None, description="Business location if found")
    confidence: int = Field(ge=0, le=100, description="Confidence score 0-100")


class ExtractedContact(BaseModel):
    """A contact/email extracted from parsed chunks."""
    temp_business_key: str = Field(description="Links to the business this contact belongs to")
    email: str = Field(description="The email address")
    name: Optional[str] = Field(default=None, description="Contact name if found")
    role: Optional[str] = Field(default=None, description="Contact role/title if found")
    confidence: int = Field(ge=0, le=100, description="Confidence score 0-100")


class ExtractedEvidence(BaseModel):
    """Evidence for a business attribute extracted from a chunk."""
    temp_business_key: str = Field(description="Links to the business")
    email: Optional[str] = Field(default=None, description="Email if this evidence is for an email")
    evidence_type: str = Field(description="Type: email_found, industry, services, tools, pain_point, location, other")
    extracted_value: str = Field(description="The extracted value/fact")
    chunk_id: str = Field(description="ID of the source chunk")
    confidence: int = Field(ge=0, le=100, description="Confidence score 0-100")


class EntityResolverOutput(BaseModel):
    """Output from the Entity Resolver Agent."""
    businesses: list[ExtractedBusiness] = Field(default_factory=list)
    contacts: list[ExtractedContact] = Field(default_factory=list)
    evidence: list[ExtractedEvidence] = Field(default_factory=list)


# Business Analyzer Agent Schemas
class UsedFact(BaseModel):
    """A fact used for personalization with evidence."""
    type: str = Field(description="Type of fact: industry, service, tool, location, etc.")
    value: str = Field(description="The fact value")
    chunk_id: str = Field(description="Source chunk ID for traceability")
    confidence: int = Field(ge=0, le=100, description="Confidence score")


class IndustryUpdateSuggestion(BaseModel):
    """Suggested updates to the industry playbook."""
    pain_point: Optional[str] = Field(default=None)
    value_prop: Optional[str] = Field(default=None)
    subject_angle: Optional[str] = Field(default=None)


class BusinessAnalyzerOutput(BaseModel):
    """Output from the Business Analyzer Agent."""
    facts_used: list[UsedFact] = Field(max_length=3, description="Up to 3 facts with evidence")
    inferred_pain_point: Optional[str] = Field(default=None, description="Only if supported by evidence")
    industry_update_suggestion: Optional[IndustryUpdateSuggestion] = Field(default=None)
    needs_review: bool = Field(default=False, description="True if fewer than 2 high-confidence facts")


# Email Writer Agent Schemas
class EmailWriterOutput(BaseModel):
    """Output from the Email Writer Agent."""
    subject: str = Field(max_length=100, description="Email subject line")
    body_text: str = Field(description="Email body, 70-110 words")


# Compliance/Deliverability Agent Schemas
class ComplianceOutput(BaseModel):
    """Output from the Compliance & Deliverability Agent."""
    deliverability_score: int = Field(ge=0, le=100, description="Deliverability score 0-100")
    spam_flags: list[str] = Field(default_factory=list, description="List of spam concerns")
    suggestions: Optional[str] = Field(default=None, description="Optional improvement suggestions")
    footer_text: str = Field(description="Footer with company name and address")


# Gatekeeper Agent Schemas
class GatekeeperOutput(BaseModel):
    """Output from the Gatekeeper Agent."""
    final_status: str = Field(description="Either 'draft' or 'needs_review'")
    reasoning: str = Field(description="Brief explanation of the decision")


# Column Mapper Agent Schemas
class ColumnMapping(BaseModel):
    """A single column mapping from source to target schema field."""
    source_column: str = Field(description="The original column name from the uploaded file")
    target_field: str = Field(description="The schema field to map to: email, business_name, website, industry, location, contact_name, role, or 'unmapped' if no match")
    confidence: int = Field(ge=0, le=100, description="Confidence score 0-100 for this mapping")
    reasoning: str = Field(description="Brief explanation of why this mapping was chosen")


class ColumnMapperOutput(BaseModel):
    """Output from the Column Mapper Agent."""
    mappings: list[ColumnMapping] = Field(description="List of column mappings")
    unmapped_columns: list[str] = Field(default_factory=list, description="Columns that couldn't be mapped to any schema field")
    warnings: list[str] = Field(default_factory=list, description="Any warnings about data quality or ambiguous mappings")


# Full Pipeline Output
class EmailGenerationResult(BaseModel):
    """Complete result from the email generation pipeline."""
    business_id: str
    contact_id: str
    subject: str
    body_text: str
    footer_text: str
    personalization_tokens: dict
    confidence_score: int
    deliverability_score: int
    spam_flags: list[str]
    status: str  # 'draft' or 'needs_review'
