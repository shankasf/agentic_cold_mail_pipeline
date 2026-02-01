"""
FastAPI server for the AI Agent Service.
Provides endpoints for the Next.js frontend to trigger agent pipelines.
"""
import os
import sys
import json
import redis.asyncio as redis

# Add parent directory for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any, Optional
import uvicorn

import config
from pipeline import run_pipeline, recheck_compliance, generate_email_for_contact, generate_follow_up_email
from email_agents import map_columns, get_mapping_dict, generate_templates

# Redis for progress updates
REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379')
UPLOAD_PROGRESS_CHANNEL = 'upload:progress'

redis_client: Optional[redis.Redis] = None

async def get_redis():
    global redis_client
    if redis_client is None:
        redis_client = redis.from_url(REDIS_URL)
    return redis_client

async def publish_progress(upload_id: str, progress: str):
    """Publish progress update to Redis for real-time UI updates."""
    if not upload_id:
        return
    try:
        r = await get_redis()
        await r.publish(
            UPLOAD_PROGRESS_CHANNEL,
            json.dumps({'uploadId': upload_id, 'progress': progress, 'timestamp': int(__import__('time').time() * 1000)})
        )
        print(f"[AI Progress] {upload_id}: {progress}")
    except Exception as e:
        print(f"[AI Progress Error] {e}")

# Initialize FastAPI
app = FastAPI(
    title="Email Marketing AI Service",
    description="Multi-agent pipeline for cold email generation using OpenAI Agents SDK",
    version="1.0.0",
)

# CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.FRONTEND_URL, "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response models
class ChunkData(BaseModel):
    id: str
    chunkIndex: int
    textContent: str
    sourceMeta: dict = {}


class GenerateEmailsRequest(BaseModel):
    chunks: list[ChunkData]
    industryPlaybooks: dict[str, dict] = {}
    uploadId: str | None = None  # For progress tracking


class GenerateEmailsResponse(BaseModel):
    businesses: list[dict]
    contacts: list[dict]
    evidence: list[dict]
    emails: list[dict]
    errors: list[str]


class RecheckComplianceRequest(BaseModel):
    subject: str
    bodyText: str


class RecheckComplianceResponse(BaseModel):
    deliverabilityScore: int
    spamFlags: list[str]
    suggestions: str | None
    footerText: str


class MapColumnsRequest(BaseModel):
    headers: list[str]
    sampleRows: list[dict] = []


class ColumnMappingItem(BaseModel):
    sourceColumn: str
    targetField: str
    confidence: int
    reasoning: str


class MapColumnsResponse(BaseModel):
    mappings: list[ColumnMappingItem]
    mappingDict: dict[str, str]  # Simple source -> target mapping for easy use
    unmappedColumns: list[str]
    warnings: list[str]


class GenerateTemplatesRequest(BaseModel):
    purpose: str
    documentContent: str | None = None
    contextHints: dict | None = None


class GenerateEmailForContactRequest(BaseModel):
    business: dict
    contact: dict
    evidence: list[dict] | None = None
    industryPlaybook: dict | None = None


class GenerateEmailForContactResponse(BaseModel):
    success: bool
    business_id: str | None = None
    contact_id: str | None = None
    subject: str | None = None
    body_text: str | None = None
    footer_text: str | None = None
    personalization_tokens: dict | None = None
    confidence_score: int | None = None
    deliverability_score: int | None = None
    spam_flags: list[str] | None = None
    status: str | None = None
    error: str | None = None


class GenerateFollowUpRequest(BaseModel):
    business: dict
    contact: dict
    previous_email: dict  # {subject: str, bodyText: str}
    industry_playbook: dict | None = None


class GenerateFollowUpResponse(BaseModel):
    success: bool
    business_id: str | None = None
    contact_id: str | None = None
    subject: str | None = None
    body_text: str | None = None
    footer_text: str | None = None
    personalization_tokens: dict | None = None
    confidence_score: int | None = None
    deliverability_score: int | None = None
    spam_flags: list[str] | None = None
    status: str | None = None
    error: str | None = None
    is_follow_up: bool = True
    sequence_number: int = 2


# Bulk email generation request/response
class BulkContactItem(BaseModel):
    business: dict
    contact: dict
    evidence: list[dict] | None = None
    industry_playbook: dict | None = None


class BulkGenerateRequest(BaseModel):
    contacts: list[BulkContactItem]
    concurrency: int = 10  # Default parallel workers


class BulkGenerateResultItem(BaseModel):
    success: bool
    business_id: str | None = None
    contact_id: str | None = None
    subject: str | None = None
    body_text: str | None = None
    footer_text: str | None = None
    personalization_tokens: dict | None = None
    confidence_score: int | None = None
    deliverability_score: int | None = None
    spam_flags: list[str] | None = None
    status: str | None = None
    error: str | None = None


class BulkGenerateResponse(BaseModel):
    results: list[BulkGenerateResultItem]
    total: int
    successful: int
    failed: int


class GeneratedTemplateItem(BaseModel):
    name: str
    subjectTemplate: str
    bodyTemplate: str
    description: str


class GenerateTemplatesResponse(BaseModel):
    template: GeneratedTemplateItem
    insights: str


# Health check
@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "ai-agent"}


# Get current configuration
@app.get("/config")
async def get_config():
    return {
        "senderName": config.SENDER_NAME,
        "senderEmail": config.SENDER_EMAIL,
        "businessAddress": config.BUSINESS_ADDRESS,
        "calendlyUrl": config.CALENDLY_URL,
        "confidenceThreshold": config.CONFIDENCE_THRESHOLD,
        "deliverabilityThreshold": config.DELIVERABILITY_THRESHOLD,
        "maxWords": config.MAX_WORDS,
        "minWords": config.MIN_WORDS,
    }


# Generate emails from chunks
@app.post("/generate", response_model=GenerateEmailsResponse)
async def generate_emails(request: GenerateEmailsRequest):
    """
    Run the full multi-agent pipeline to generate emails from parsed chunks.
    """
    if not request.chunks:
        raise HTTPException(status_code=400, detail="No chunks provided")

    upload_id = request.uploadId

    # Create progress callback
    async def progress_callback(msg: str):
        await publish_progress(upload_id, msg)

    try:
        # Convert to dict format
        chunks = [c.model_dump() for c in request.chunks]

        await progress_callback("🤖 AI Pipeline starting...")

        # Run pipeline with progress callback
        result = await run_pipeline(
            chunks=chunks,
            industry_playbooks=request.industryPlaybooks,
            progress_callback=progress_callback,
        )

        await progress_callback(f"🎉 AI Pipeline complete! Generated {len(result.get('emails', []))} emails")

        return GenerateEmailsResponse(**result)

    except Exception as e:
        await progress_callback(f"❌ Pipeline error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}")


# Recheck compliance for edited email
@app.post("/recheck-compliance", response_model=RecheckComplianceResponse)
async def recheck_compliance_endpoint(request: RecheckComplianceRequest):
    """
    Re-run compliance check on an edited email.
    """
    try:
        result = await recheck_compliance(
            subject=request.subject,
            body_text=request.bodyText,
        )

        return RecheckComplianceResponse(
            deliverabilityScore=result['deliverability_score'],
            spamFlags=result['spam_flags'],
            suggestions=result.get('suggestions'),
            footerText=result['footer_text'],
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Compliance check error: {str(e)}")


# Map columns using AI
@app.post("/map-columns", response_model=MapColumnsResponse)
async def map_columns_endpoint(request: MapColumnsRequest):
    """
    Use AI to intelligently map source columns to target schema fields.
    Understands semantic equivalence like "Company Name" = "Business Name".
    """
    if not request.headers:
        raise HTTPException(status_code=400, detail="No headers provided")

    try:
        # Call the column mapper agent
        result = await map_columns(
            headers=request.headers,
            sample_rows=request.sampleRows,
        )

        # Convert to response format
        mappings = [
            ColumnMappingItem(
                sourceColumn=m.source_column,
                targetField=m.target_field,
                confidence=m.confidence,
                reasoning=m.reasoning,
            )
            for m in result.mappings
        ]

        # Get simple mapping dict for easy use
        mapping_dict = get_mapping_dict(result)

        return MapColumnsResponse(
            mappings=mappings,
            mappingDict=mapping_dict,
            unmappedColumns=result.unmapped_columns,
            warnings=result.warnings,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Column mapping error: {str(e)}")


# Generate templates based on purpose
@app.post("/generate-templates", response_model=GenerateTemplatesResponse)
async def generate_templates_endpoint(request: GenerateTemplatesRequest):
    """
    Generate email templates based on user's stated purpose using AI.
    Returns professional templates that pass spam filters.
    """
    if not request.purpose or len(request.purpose.strip()) < 5:
        raise HTTPException(
            status_code=400,
            detail="Purpose is required and must be at least 5 characters"
        )

    try:
        result = await generate_templates(
            purpose=request.purpose,
            document_content=request.documentContent,
            context_hints=request.contextHints,
        )

        # Convert to response format
        template = GeneratedTemplateItem(
            name=result.template.name,
            subjectTemplate=result.template.subject_template,
            bodyTemplate=result.template.body_template,
            description=result.template.description,
        )

        return GenerateTemplatesResponse(
            template=template,
            insights=result.insights,
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Template generation error: {str(e)}"
        )


# Generate email for existing business/contact
@app.post("/generate-email-for-contact", response_model=GenerateEmailForContactResponse)
async def generate_email_for_contact_endpoint(request: GenerateEmailForContactRequest):
    """
    Generate a single email for an existing business/contact pair.
    Skips entity extraction - use this when you already have business and contact data.
    """
    if not request.business:
        raise HTTPException(status_code=400, detail="Business data is required")
    if not request.contact:
        raise HTTPException(status_code=400, detail="Contact data is required")
    if not request.contact.get('email'):
        raise HTTPException(status_code=400, detail="Contact email is required")

    try:
        result = await generate_email_for_contact(
            business=request.business,
            contact=request.contact,
            evidence=request.evidence,
            industry_playbook=request.industryPlaybook,
        )

        return GenerateEmailForContactResponse(**result)

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Email generation error: {str(e)}"
        )


# Generate follow-up email
@app.post("/generate-follow-up", response_model=GenerateFollowUpResponse)
async def generate_follow_up_endpoint(request: GenerateFollowUpRequest):
    """
    Generate a follow-up email based on a previous email.
    Skips email validation and creates a contextually relevant follow-up.
    """
    if not request.business:
        raise HTTPException(status_code=400, detail="Business data is required")
    if not request.contact:
        raise HTTPException(status_code=400, detail="Contact data is required")
    if not request.contact.get('email'):
        raise HTTPException(status_code=400, detail="Contact email is required")
    if not request.previous_email:
        raise HTTPException(status_code=400, detail="Previous email data is required")

    try:
        result = await generate_follow_up_email(
            business=request.business,
            contact=request.contact,
            previous_email=request.previous_email,
            industry_playbook=request.industry_playbook,
        )

        return GenerateFollowUpResponse(
            **result,
            is_follow_up=True,
            sequence_number=2,
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Follow-up generation error: {str(e)}"
        )


# Bulk generate emails with parallel processing
@app.post("/generate-emails-bulk", response_model=BulkGenerateResponse)
async def generate_emails_bulk(request: BulkGenerateRequest):
    """
    Generate emails for multiple contacts in parallel using semaphore-bounded concurrency.
    Optimized for bulk operations - processes all contacts concurrently (bounded by concurrency limit).
    """
    import asyncio

    if not request.contacts:
        raise HTTPException(status_code=400, detail="No contacts provided")

    # Limit concurrency to reasonable bounds
    concurrency = min(max(1, request.concurrency), 50)  # Between 1-50
    semaphore = asyncio.Semaphore(concurrency)

    print(f"[Bulk Generate] Starting bulk generation for {len(request.contacts)} contacts with concurrency={concurrency}")

    async def generate_with_semaphore(item: BulkContactItem, index: int) -> BulkGenerateResultItem:
        """Process a single contact with semaphore-bounded concurrency."""
        async with semaphore:
            try:
                result = await generate_email_for_contact(
                    business=item.business,
                    contact=item.contact,
                    evidence=item.evidence,
                    industry_playbook=item.industry_playbook,
                )

                return BulkGenerateResultItem(
                    success=result.get('success', False),
                    business_id=result.get('business_id'),
                    contact_id=result.get('contact_id'),
                    subject=result.get('subject'),
                    body_text=result.get('body_text'),
                    footer_text=result.get('footer_text'),
                    personalization_tokens=result.get('personalization_tokens'),
                    confidence_score=result.get('confidence_score'),
                    deliverability_score=result.get('deliverability_score'),
                    spam_flags=result.get('spam_flags'),
                    status=result.get('status'),
                    error=result.get('error'),
                )
            except Exception as e:
                print(f"[Bulk Generate] Error processing contact {index}: {str(e)}")
                return BulkGenerateResultItem(
                    success=False,
                    business_id=item.business.get('id'),
                    contact_id=item.contact.get('id', item.contact.get('email')),
                    error=str(e),
                )

    # Process ALL contacts in parallel (bounded by semaphore)
    tasks = [
        generate_with_semaphore(item, i)
        for i, item in enumerate(request.contacts)
    ]
    results = await asyncio.gather(*tasks)

    # Count successes and failures
    successful = sum(1 for r in results if r.success)
    failed = len(results) - successful

    print(f"[Bulk Generate] Completed: {successful} successful, {failed} failed out of {len(results)} total")

    return BulkGenerateResponse(
        results=results,
        total=len(results),
        successful=successful,
        failed=failed,
    )


if __name__ == "__main__":
    print(f"Starting AI Service on {config.API_HOST}:{config.API_PORT}")
    uvicorn.run(
        "main:app",
        host=config.API_HOST,
        port=config.API_PORT,
        reload=True,
    )
