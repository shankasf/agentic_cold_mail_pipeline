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
from pipeline import run_pipeline, recheck_compliance

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
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
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


if __name__ == "__main__":
    print(f"Starting AI Service on {config.API_HOST}:{config.API_PORT}")
    uvicorn.run(
        "main:app",
        host=config.API_HOST,
        port=config.API_PORT,
        reload=True,
    )
