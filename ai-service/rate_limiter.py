"""
Rate Limiter for OpenAI API

Implements token bucket algorithm to prevent hitting OpenAI rate limits:
- Tokens per minute limit
- Requests per minute limit

Features:
- Async-friendly with proper locking
- Automatic bucket refill
- Queue requests when approaching limit
- Graceful degradation
"""
import asyncio
import time
from typing import Optional
from dataclasses import dataclass, field
from agent_logger import logger


@dataclass
class RateLimiterStats:
    """Statistics for rate limiter."""
    total_requests: int = 0
    allowed_requests: int = 0
    throttled_requests: int = 0
    total_tokens: int = 0
    total_wait_time_ms: int = 0
    last_refill_time: Optional[float] = None


class TokenBucket:
    """
    Token bucket rate limiter implementation.

    Supports both request rate limiting and token rate limiting.
    """

    def __init__(
        self,
        name: str,
        tokens_per_minute: int = 10000,
        requests_per_minute: int = 60,
        burst_multiplier: float = 1.2,  # Allow 20% burst
    ):
        """
        Initialize token bucket.

        Args:
            name: Name for logging
            tokens_per_minute: Maximum tokens per minute
            requests_per_minute: Maximum requests per minute
            burst_multiplier: Allow this much burst capacity
        """
        self.name = name
        self.tokens_per_minute = tokens_per_minute
        self.requests_per_minute = requests_per_minute

        # Calculate bucket capacities with burst allowance
        self.max_tokens = int(tokens_per_minute * burst_multiplier)
        self.max_requests = int(requests_per_minute * burst_multiplier)

        # Current bucket levels
        self._tokens = self.max_tokens
        self._requests = self.max_requests
        self._last_refill = time.time()

        # Refill rates (per second)
        self._token_rate = tokens_per_minute / 60.0
        self._request_rate = requests_per_minute / 60.0

        # Lock for async safety
        self._lock = asyncio.Lock()

        # Statistics
        self._stats = RateLimiterStats()

    def _refill(self) -> None:
        """Refill buckets based on elapsed time."""
        now = time.time()
        elapsed = now - self._last_refill

        # Refill tokens
        self._tokens = min(
            self.max_tokens,
            self._tokens + (elapsed * self._token_rate)
        )

        # Refill requests
        self._requests = min(
            self.max_requests,
            self._requests + (elapsed * self._request_rate)
        )

        self._last_refill = now
        self._stats.last_refill_time = now

    def _estimate_wait_time(self, tokens_needed: int) -> float:
        """Estimate wait time in seconds to acquire tokens."""
        if self._requests < 1:
            # Need to wait for request slot
            request_wait = (1 - self._requests) / self._request_rate
        else:
            request_wait = 0

        if self._tokens < tokens_needed:
            # Need to wait for tokens
            token_wait = (tokens_needed - self._tokens) / self._token_rate
        else:
            token_wait = 0

        return max(request_wait, token_wait)

    async def acquire(
        self,
        tokens: int = 0,
        max_wait_seconds: float = 30.0,
    ) -> bool:
        """
        Acquire rate limit tokens.

        Args:
            tokens: Number of tokens to consume (0 for request-only limiting)
            max_wait_seconds: Maximum time to wait for capacity

        Returns:
            True if acquired, False if timeout
        """
        start_time = time.time()

        async with self._lock:
            self._stats.total_requests += 1

            # Refill buckets
            self._refill()

            # Check if we can proceed immediately
            if self._requests >= 1 and (tokens == 0 or self._tokens >= tokens):
                self._requests -= 1
                if tokens > 0:
                    self._tokens -= tokens
                    self._stats.total_tokens += tokens
                self._stats.allowed_requests += 1
                return True

            # Calculate wait time
            wait_time = self._estimate_wait_time(tokens)

            if wait_time > max_wait_seconds:
                self._stats.throttled_requests += 1
                logger.warn(
                    f"Rate limit would require {wait_time:.2f}s wait (max: {max_wait_seconds}s)",
                    limiter=self.name,
                    tokens_needed=tokens,
                    current_tokens=self._tokens,
                    current_requests=self._requests,
                )
                return False

            # Wait for capacity
            if wait_time > 0:
                logger.debug(
                    f"Rate limiting: waiting {wait_time:.2f}s",
                    limiter=self.name,
                    tokens_needed=tokens,
                )

        # Release lock while waiting
        if wait_time > 0:
            await asyncio.sleep(wait_time)
            self._stats.total_wait_time_ms += int(wait_time * 1000)

        # Re-acquire lock and consume
        async with self._lock:
            self._refill()

            # Double-check capacity after wait
            if self._requests >= 1 and (tokens == 0 or self._tokens >= tokens):
                self._requests -= 1
                if tokens > 0:
                    self._tokens -= tokens
                    self._stats.total_tokens += tokens
                self._stats.allowed_requests += 1
                return True

            # Still not enough - reject
            self._stats.throttled_requests += 1
            return False

    async def acquire_or_wait(
        self,
        tokens: int = 0,
    ) -> None:
        """
        Acquire tokens, waiting as long as necessary.

        Args:
            tokens: Number of tokens to consume
        """
        while True:
            if await self.acquire(tokens, max_wait_seconds=60.0):
                return
            # If acquire returned False, we'll try again
            await asyncio.sleep(1.0)

    def get_stats(self) -> dict:
        """Get rate limiter statistics."""
        return {
            'name': self.name,
            'current_tokens': int(self._tokens),
            'max_tokens': self.max_tokens,
            'current_requests': int(self._requests),
            'max_requests': self.max_requests,
            'tokens_per_minute': self.tokens_per_minute,
            'requests_per_minute': self.requests_per_minute,
            'stats': {
                'total_requests': self._stats.total_requests,
                'allowed_requests': self._stats.allowed_requests,
                'throttled_requests': self._stats.throttled_requests,
                'total_tokens': self._stats.total_tokens,
                'total_wait_time_ms': self._stats.total_wait_time_ms,
                'throttle_rate': self._stats.throttled_requests / self._stats.total_requests
                    if self._stats.total_requests > 0 else 0,
            },
        }

    def reset(self) -> None:
        """Reset buckets to full capacity."""
        self._tokens = self.max_tokens
        self._requests = self.max_requests
        self._last_refill = time.time()
        logger.info(f"Rate limiter reset", limiter=self.name)


class OpenAIRateLimiter:
    """
    Rate limiter specifically for OpenAI API calls.

    Manages both token and request limits across multiple models.
    """

    def __init__(
        self,
        tokens_per_minute: int = 10000,
        requests_per_minute: int = 60,
    ):
        """
        Initialize OpenAI rate limiter.

        Args:
            tokens_per_minute: Token limit per minute
            requests_per_minute: Request limit per minute
        """
        self._bucket = TokenBucket(
            name="openai",
            tokens_per_minute=tokens_per_minute,
            requests_per_minute=requests_per_minute,
        )

    async def acquire(
        self,
        estimated_tokens: int = 0,
        max_wait_seconds: float = 30.0,
    ) -> bool:
        """
        Acquire capacity for an OpenAI API call.

        Args:
            estimated_tokens: Estimated tokens for this request
            max_wait_seconds: Maximum time to wait

        Returns:
            True if acquired, False if timeout
        """
        return await self._bucket.acquire(estimated_tokens, max_wait_seconds)

    async def acquire_or_wait(self, estimated_tokens: int = 0) -> None:
        """Acquire capacity, waiting as long as necessary."""
        await self._bucket.acquire_or_wait(estimated_tokens)

    def report_actual_tokens(self, actual_tokens: int, estimated_tokens: int) -> None:
        """
        Report actual token usage after a call.

        If actual usage differs significantly from estimate, log a warning.
        """
        if estimated_tokens > 0:
            diff = actual_tokens - estimated_tokens
            if abs(diff) > estimated_tokens * 0.5:  # More than 50% off
                logger.warn(
                    f"Token estimate was off: estimated={estimated_tokens}, actual={actual_tokens}",
                    limiter="openai",
                    difference=diff,
                )

    def get_stats(self) -> dict:
        """Get rate limiter statistics."""
        return self._bucket.get_stats()

    def reset(self) -> None:
        """Reset rate limiter."""
        self._bucket.reset()


# Global rate limiter instance
# Default: 10,000 tokens/min, 60 requests/min (conservative for gpt-4)
openai_rate_limiter = OpenAIRateLimiter(
    tokens_per_minute=10000,
    requests_per_minute=60,
)


async def with_rate_limit(
    func,
    *args,
    estimated_tokens: int = 500,
    **kwargs,
):
    """
    Execute a function with rate limiting.

    Usage:
        result = await with_rate_limit(
            call_openai,
            prompt,
            estimated_tokens=1000,
        )
    """
    # Acquire rate limit
    acquired = await openai_rate_limiter.acquire(
        estimated_tokens=estimated_tokens,
        max_wait_seconds=60.0,
    )

    if not acquired:
        raise Exception("Rate limit exceeded - could not acquire capacity")

    # Execute the function
    return await func(*args, **kwargs)


# Decorator for rate limiting
def rate_limited(estimated_tokens: int = 500):
    """
    Decorator to add rate limiting to async functions.

    Usage:
        @rate_limited(estimated_tokens=1000)
        async def call_openai(prompt: str):
            ...
    """
    def decorator(func):
        async def wrapper(*args, **kwargs):
            return await with_rate_limit(func, *args, estimated_tokens=estimated_tokens, **kwargs)
        return wrapper
    return decorator


def get_rate_limiter_status() -> dict:
    """Get status of the global rate limiter."""
    return openai_rate_limiter.get_stats()
