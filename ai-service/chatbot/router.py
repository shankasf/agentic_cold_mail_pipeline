"""
FastAPI router for chatbot endpoints.
Provides POST /chat, GET /chat/stream, and GET /chat/suggestions.
"""

import json
import asyncio
from typing import Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from agents import Runner

from .agents import router_agent, suggestions_agent
from .db import init_pool, close_pool

router = APIRouter(prefix="/chat", tags=["chatbot"])


class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    conversation_id: Optional[str] = None
    agent_name: Optional[str] = None


class SuggestionsResponse(BaseModel):
    suggestions: str
    agent_name: str = "SuggestionsAgent"


# Store conversations in memory (for demo - in production use Redis or DB)
_conversations: dict[str, list] = {}


@router.on_event("startup")
async def startup():
    """Initialize database pool on startup."""
    await init_pool()


@router.on_event("shutdown")
async def shutdown():
    """Close database pool on shutdown."""
    await close_pool()


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Send a message to the chatbot and get a response.
    Uses the multi-agent system with automatic routing.
    """
    if not request.message or not request.message.strip():
        raise HTTPException(status_code=400, detail="Message is required")

    try:
        # Initialize database pool
        await init_pool()

        # Get or create conversation history
        conv_id = request.conversation_id or str(hash(request.message))[:8]
        history = _conversations.get(conv_id, [])

        # Add user message to history
        history.append({"role": "user", "content": request.message})

        # Run the agent
        result = await Runner.run(
            router_agent,
            input=history,
        )

        # Extract the response
        response_text = ""
        agent_name = "RouterAgent"

        # Get the final output from the result
        if result.final_output:
            response_text = str(result.final_output)

        # Try to get agent name from result metadata if available
        if hasattr(result, 'last_agent') and result.last_agent:
            agent_name = result.last_agent.name if hasattr(result.last_agent, 'name') else "RouterAgent"

        # Add assistant response to history
        history.append({"role": "assistant", "content": response_text})
        _conversations[conv_id] = history[-20:]  # Keep last 20 messages

        return ChatResponse(
            response=response_text,
            conversation_id=conv_id,
            agent_name=agent_name,
        )

    except Exception as e:
        print(f"[Chatbot Error] {str(e)}")
        raise HTTPException(status_code=500, detail=f"Chatbot error: {str(e)}")


@router.get("/stream")
async def chat_stream(message: str, conversation_id: Optional[str] = None):
    """
    Stream a chatbot response using Server-Sent Events (SSE).
    """
    if not message or not message.strip():
        raise HTTPException(status_code=400, detail="Message is required")

    async def generate():
        try:
            # Initialize database pool
            await init_pool()

            # Get or create conversation history
            conv_id = conversation_id or str(hash(message))[:8]
            history = _conversations.get(conv_id, [])
            history.append({"role": "user", "content": message})

            # Run the agent with streaming
            result = await Runner.run(
                router_agent,
                input=history,
            )

            # Stream the response
            response_text = result.final_output or ""

            # Simulate streaming by sending chunks
            chunk_size = 20
            for i in range(0, len(response_text), chunk_size):
                chunk = response_text[i:i + chunk_size]
                yield f"data: {json.dumps({'chunk': chunk, 'done': False})}\n\n"
                await asyncio.sleep(0.02)  # Small delay for streaming effect

            # Send completion message
            yield f"data: {json.dumps({'chunk': '', 'done': True, 'conversation_id': conv_id})}\n\n"

            # Update history
            history.append({"role": "assistant", "content": response_text})
            _conversations[conv_id] = history[-20:]

        except Exception as e:
            yield f"data: {json.dumps({'error': str(e), 'done': True})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.get("/suggestions", response_model=SuggestionsResponse)
async def get_suggestions():
    """
    Get proactive suggestions from the SuggestionsAgent.
    Analyzes current state and provides recommendations.
    """
    try:
        # Initialize database pool
        await init_pool()

        # Run the suggestions agent directly
        result = await Runner.run(
            suggestions_agent,
            input=[{
                "role": "user",
                "content": "Analyze my email marketing data and give me your top 3-5 actionable suggestions for what I should focus on right now. Check unread replies, emails needing review, campaign performance, and any issues with my sending metrics."
            }],
        )

        response_text = result.final_output or "No suggestions available at this time."

        return SuggestionsResponse(
            suggestions=response_text,
            agent_name="SuggestionsAgent",
        )

    except Exception as e:
        print(f"[Suggestions Error] {str(e)}")
        raise HTTPException(status_code=500, detail=f"Suggestions error: {str(e)}")


@router.delete("/history/{conversation_id}")
async def clear_history(conversation_id: str):
    """Clear conversation history for a given conversation ID."""
    if conversation_id in _conversations:
        del _conversations[conversation_id]
        return {"message": "Conversation history cleared"}
    return {"message": "No history found for this conversation"}


@router.get("/health")
async def health():
    """Health check for the chatbot service."""
    return {"status": "ok", "service": "chatbot"}
