"""
Structured logging and tracing for AI Agent Service.
Outputs JSON logs for real-time monitoring in the frontend logs dashboard.

Features:
- Structured JSON logging
- OpenAI SDK tracing integration
- Pipeline trace correlation
- Performance metrics capture
"""
import json
import time
import sys
import uuid
from typing import Any, Optional
from datetime import datetime
from functools import wraps
from contextlib import contextmanager, asynccontextmanager
import asyncio
import redis.asyncio as redis
import os

REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379')
AGENT_LOGS_CHANNEL = 'agent:logs'
SERVICE_LOGS_CHANNEL = 'service:logs'
SERVICE_LOGS_LIST = 'service:logs:history'  # Redis list for log history
TRACE_LOGS_CHANNEL = 'agent:traces'  # Channel for trace events
MAX_LOG_HISTORY = 500  # Keep last 500 logs

# Trace ID context for correlation
_trace_context: dict = {}

redis_client: Optional[redis.Redis] = None
sync_redis_client = None

async def get_redis():
    global redis_client
    if redis_client is None:
        redis_client = redis.from_url(REDIS_URL)
    return redis_client

def get_sync_redis():
    global sync_redis_client
    if sync_redis_client is None:
        import redis as sync_redis
        sync_redis_client = sync_redis.from_url(REDIS_URL)
    return sync_redis_client


class AgentLogger:
    """Structured logger for AI agents with Redis pub/sub support."""

    def __init__(self, service: str = "ai-service"):
        self.service = service
        self._current_context: dict = {}

    def set_context(self, **kwargs):
        """Set context that will be included in all subsequent logs."""
        self._current_context.update(kwargs)

    def clear_context(self):
        """Clear the current context."""
        self._current_context = {}

    def _format_log(
        self,
        level: str,
        message: str,
        agent: Optional[str] = None,
        tool: Optional[str] = None,
        metadata: Optional[dict] = None
    ) -> dict:
        """Format a log entry as structured JSON."""
        entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "service": self.service,
            "level": level,
            "message": message,
        }

        if agent:
            entry["agent"] = agent

        if tool:
            entry["tool"] = tool

        context = {**self._current_context}
        if metadata:
            context.update(metadata)

        if context:
            entry["metadata"] = context

        return entry

    def _output(self, entry: dict):
        """Output the log entry to stdout and publish to Redis for streaming."""
        log_json = json.dumps(entry)
        print(log_json, file=sys.stdout, flush=True)

        # Publish to Redis for real-time streaming and store in history
        try:
            r = get_sync_redis()
            # Publish for real-time subscribers
            r.publish(SERVICE_LOGS_CHANNEL, log_json)
            # Store in history list (LPUSH adds to front, LTRIM keeps only recent)
            r.lpush(SERVICE_LOGS_LIST, log_json)
            r.ltrim(SERVICE_LOGS_LIST, 0, MAX_LOG_HISTORY - 1)
        except Exception:
            pass  # Don't fail logging if Redis unavailable

    async def _publish(self, entry: dict):
        """Publish log entry to Redis for real-time streaming."""
        try:
            r = await get_redis()
            await r.publish(AGENT_LOGS_CHANNEL, json.dumps(entry))
        except Exception:
            pass  # Don't fail on logging errors

    def info(self, message: str, agent: str = None, tool: str = None, **kwargs):
        entry = self._format_log("info", message, agent, tool, kwargs if kwargs else None)
        self._output(entry)

    def debug(self, message: str, agent: str = None, tool: str = None, **kwargs):
        entry = self._format_log("debug", message, agent, tool, kwargs if kwargs else None)
        self._output(entry)

    def warn(self, message: str, agent: str = None, tool: str = None, **kwargs):
        entry = self._format_log("warn", message, agent, tool, kwargs if kwargs else None)
        self._output(entry)

    def error(self, message: str, agent: str = None, tool: str = None, **kwargs):
        entry = self._format_log("error", message, agent, tool, kwargs if kwargs else None)
        self._output(entry)

    def agent_start(self, agent_name: str, task: str = None, **kwargs):
        """Log the start of an agent execution."""
        self.info(
            f"Agent: {agent_name} starting",
            agent=agent_name,
            task=task,
            status="started",
            **kwargs
        )

    def agent_complete(self, agent_name: str, result: str = None, duration_ms: int = None, **kwargs):
        """Log the completion of an agent execution."""
        self.info(
            f"Agent: {agent_name} completed" + (f" in {duration_ms}ms" if duration_ms else ""),
            agent=agent_name,
            result=result,
            status="completed",
            duration_ms=duration_ms,
            **kwargs
        )

    def agent_error(self, agent_name: str, error: str, **kwargs):
        """Log an agent error."""
        self.error(
            f"Agent: {agent_name} failed - {error}",
            agent=agent_name,
            error=error,
            status="failed",
            **kwargs
        )

    def tool_call(self, tool_name: str, agent_name: str = None, params: dict = None, **kwargs):
        """Log a tool being called by an agent."""
        self.debug(
            f"Tool: {tool_name} called" + (f" by {agent_name}" if agent_name else ""),
            agent=agent_name,
            tool=tool_name,
            tool_params=params,
            **kwargs
        )

    def tool_result(self, tool_name: str, success: bool, result: Any = None, duration_ms: int = None, **kwargs):
        """Log the result of a tool execution."""
        level = "info" if success else "error"
        msg = f"Tool: {tool_name} {'succeeded' if success else 'failed'}"
        if duration_ms:
            msg += f" in {duration_ms}ms"

        entry = self._format_log(
            level,
            msg,
            tool=tool_name,
            metadata={
                "success": success,
                "duration_ms": duration_ms,
                **({"result_preview": str(result)[:200]} if result else {}),
                **kwargs
            }
        )
        self._output(entry)

    def llm_call(self, model: str, agent_name: str = None, prompt_tokens: int = None, **kwargs):
        """Log an LLM API call."""
        self.debug(
            f"LLM: Calling {model}" + (f" for {agent_name}" if agent_name else ""),
            agent=agent_name,
            model=model,
            prompt_tokens=prompt_tokens,
            **kwargs
        )

    def llm_response(self, model: str, completion_tokens: int = None, duration_ms: int = None, **kwargs):
        """Log an LLM response."""
        self.debug(
            f"LLM: {model} responded" + (f" in {duration_ms}ms" if duration_ms else ""),
            model=model,
            completion_tokens=completion_tokens,
            duration_ms=duration_ms,
            **kwargs
        )

    def pipeline_start(self, pipeline_name: str, **kwargs):
        """Log the start of a pipeline."""
        self.info(
            f"Pipeline: {pipeline_name} starting",
            pipeline=pipeline_name,
            status="started",
            **kwargs
        )

    def pipeline_step(self, pipeline_name: str, step: int, total_steps: int, description: str, **kwargs):
        """Log a pipeline step."""
        self.info(
            f"Pipeline: {pipeline_name} step {step}/{total_steps} - {description}",
            pipeline=pipeline_name,
            step=step,
            total_steps=total_steps,
            **kwargs
        )

    def pipeline_complete(self, pipeline_name: str, duration_ms: int = None, **kwargs):
        """Log the completion of a pipeline."""
        self.info(
            f"Pipeline: {pipeline_name} completed" + (f" in {duration_ms}ms" if duration_ms else ""),
            pipeline=pipeline_name,
            status="completed",
            duration_ms=duration_ms,
            **kwargs
        )


def log_agent_execution(agent_name: str):
    """Decorator to automatically log agent execution with timing."""
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            logger = AgentLogger()
            start_time = time.time()
            logger.agent_start(agent_name)

            try:
                result = await func(*args, **kwargs)
                duration_ms = int((time.time() - start_time) * 1000)
                logger.agent_complete(agent_name, duration_ms=duration_ms)
                return result
            except Exception as e:
                logger.agent_error(agent_name, str(e))
                raise

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            logger = AgentLogger()
            start_time = time.time()
            logger.agent_start(agent_name)

            try:
                result = func(*args, **kwargs)
                duration_ms = int((time.time() - start_time) * 1000)
                logger.agent_complete(agent_name, duration_ms=duration_ms)
                return result
            except Exception as e:
                logger.agent_error(agent_name, str(e))
                raise

        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator


# Global logger instance
logger = AgentLogger()


class AgentTrace:
    """
    Trace context for tracking agent execution across the pipeline.

    Features:
    - Trace ID correlation
    - Token usage tracking
    - Latency measurement
    - Model information capture
    """

    def __init__(
        self,
        trace_id: Optional[str] = None,
        pipeline_name: str = "unknown",
        parent_trace_id: Optional[str] = None,
    ):
        self.trace_id = trace_id or f"trace_{uuid.uuid4().hex[:12]}"
        self.pipeline_name = pipeline_name
        self.parent_trace_id = parent_trace_id
        self.start_time = time.time()
        self.end_time: Optional[float] = None

        # Agent spans
        self.spans: list[dict] = []
        self._current_span: Optional[dict] = None

        # Aggregate metrics
        self.total_tokens = 0
        self.total_prompt_tokens = 0
        self.total_completion_tokens = 0
        self.agent_calls = 0
        self.errors = 0

        # Store in context
        _trace_context[self.trace_id] = self

    def start_span(
        self,
        agent_name: str,
        operation: str = "run",
        model: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> str:
        """Start a new span within this trace."""
        span_id = f"span_{uuid.uuid4().hex[:8]}"

        self._current_span = {
            "span_id": span_id,
            "trace_id": self.trace_id,
            "agent_name": agent_name,
            "operation": operation,
            "model": model,
            "start_time": time.time(),
            "end_time": None,
            "duration_ms": None,
            "tokens": None,
            "prompt_tokens": None,
            "completion_tokens": None,
            "status": "running",
            "error": None,
            "metadata": metadata or {},
        }

        logger.debug(
            f"Span started: {agent_name}.{operation}",
            trace_id=self.trace_id,
            span_id=span_id,
            agent=agent_name,
        )

        return span_id

    def end_span(
        self,
        span_id: str,
        status: str = "success",
        tokens: Optional[int] = None,
        prompt_tokens: Optional[int] = None,
        completion_tokens: Optional[int] = None,
        error: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> None:
        """End a span."""
        if self._current_span and self._current_span["span_id"] == span_id:
            span = self._current_span
            span["end_time"] = time.time()
            span["duration_ms"] = int((span["end_time"] - span["start_time"]) * 1000)
            span["status"] = status
            span["tokens"] = tokens
            span["prompt_tokens"] = prompt_tokens
            span["completion_tokens"] = completion_tokens
            span["error"] = error

            if metadata:
                span["metadata"].update(metadata)

            # Update aggregate metrics
            self.agent_calls += 1
            if tokens:
                self.total_tokens += tokens
            if prompt_tokens:
                self.total_prompt_tokens += prompt_tokens
            if completion_tokens:
                self.total_completion_tokens += completion_tokens
            if status == "error":
                self.errors += 1

            self.spans.append(span)
            self._current_span = None

            logger.debug(
                f"Span ended: {span['agent_name']}.{span['operation']}",
                trace_id=self.trace_id,
                span_id=span_id,
                duration_ms=span["duration_ms"],
                status=status,
                tokens=tokens,
            )

    def complete(self, status: str = "success") -> dict:
        """Complete the trace and return summary."""
        self.end_time = time.time()
        total_duration = int((self.end_time - self.start_time) * 1000)

        summary = {
            "trace_id": self.trace_id,
            "pipeline_name": self.pipeline_name,
            "parent_trace_id": self.parent_trace_id,
            "status": status,
            "start_time": datetime.fromtimestamp(self.start_time).isoformat() + "Z",
            "end_time": datetime.fromtimestamp(self.end_time).isoformat() + "Z",
            "total_duration_ms": total_duration,
            "agent_calls": self.agent_calls,
            "errors": self.errors,
            "total_tokens": self.total_tokens,
            "total_prompt_tokens": self.total_prompt_tokens,
            "total_completion_tokens": self.total_completion_tokens,
            "spans": self.spans,
        }

        # Log trace completion
        logger.info(
            f"Trace completed: {self.pipeline_name}",
            trace_id=self.trace_id,
            duration_ms=total_duration,
            agent_calls=self.agent_calls,
            total_tokens=self.total_tokens,
        )

        # Publish trace to Redis
        try:
            r = get_sync_redis()
            r.publish(TRACE_LOGS_CHANNEL, json.dumps(summary))
        except Exception:
            pass

        # Remove from context
        _trace_context.pop(self.trace_id, None)

        return summary


def get_current_trace() -> Optional[AgentTrace]:
    """Get the current active trace from context."""
    # Return the most recent trace
    if _trace_context:
        return list(_trace_context.values())[-1]
    return None


@asynccontextmanager
async def trace_pipeline(
    pipeline_name: str,
    trace_id: Optional[str] = None,
):
    """
    Async context manager for tracing a pipeline execution.

    Usage:
        async with trace_pipeline("email_generation") as trace:
            # Pipeline code here
            span_id = trace.start_span("EntityResolver")
            # Agent code
            trace.end_span(span_id, tokens=100)
    """
    trace = AgentTrace(trace_id=trace_id, pipeline_name=pipeline_name)
    try:
        yield trace
        trace.complete("success")
    except Exception as e:
        trace.complete("error")
        raise


@contextmanager
def trace_pipeline_sync(
    pipeline_name: str,
    trace_id: Optional[str] = None,
):
    """Sync context manager for tracing a pipeline."""
    trace = AgentTrace(trace_id=trace_id, pipeline_name=pipeline_name)
    try:
        yield trace
        trace.complete("success")
    except Exception as e:
        trace.complete("error")
        raise


def trace_agent_call(agent_name: str, model: Optional[str] = None):
    """
    Decorator to automatically trace agent calls.

    Usage:
        @trace_agent_call("EmailWriter", model="gpt-4")
        async def write_email(...):
            ...
    """
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            trace = get_current_trace()
            span_id = None

            if trace:
                span_id = trace.start_span(agent_name, model=model)

            start_time = time.time()
            try:
                result = await func(*args, **kwargs)
                duration_ms = int((time.time() - start_time) * 1000)

                if trace and span_id:
                    # Try to extract token info from result if available
                    tokens = None
                    if hasattr(result, 'usage'):
                        tokens = getattr(result.usage, 'total_tokens', None)
                    trace.end_span(span_id, status="success", tokens=tokens)

                return result

            except Exception as e:
                if trace and span_id:
                    trace.end_span(span_id, status="error", error=str(e))
                raise

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            trace = get_current_trace()
            span_id = None

            if trace:
                span_id = trace.start_span(agent_name, model=model)

            start_time = time.time()
            try:
                result = func(*args, **kwargs)
                if trace and span_id:
                    trace.end_span(span_id, status="success")
                return result
            except Exception as e:
                if trace and span_id:
                    trace.end_span(span_id, status="error", error=str(e))
                raise

        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator


def get_trace_stats() -> dict:
    """Get statistics about active traces."""
    return {
        "active_traces": len(_trace_context),
        "traces": {
            trace_id: {
                "pipeline": trace.pipeline_name,
                "agent_calls": trace.agent_calls,
                "total_tokens": trace.total_tokens,
                "running_since": datetime.fromtimestamp(trace.start_time).isoformat(),
            }
            for trace_id, trace in _trace_context.items()
        }
    }
