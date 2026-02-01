"""
AI Response Caching Module

Provides Redis-based caching for AI agent responses to:
1. Reduce API costs by avoiding duplicate calls
2. Speed up repeated operations
3. Improve resilience during service issues

Cache strategies:
- Compliance checks: 1 hour TTL (email content rarely changes)
- Business analysis: 24 hour TTL (business facts are stable)
- Entity resolution: 6 hour TTL (for batch reprocessing)
"""
import hashlib
import json
import time
from typing import Optional, TypeVar, Callable, Awaitable, Any
from dataclasses import dataclass, asdict
import redis.asyncio as redis
import os
from agent_logger import logger

T = TypeVar('T')

REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379')

# Cache TTLs in seconds
CACHE_TTL = {
    'compliance': 3600,      # 1 hour
    'business_analysis': 86400,  # 24 hours
    'entity_resolution': 21600,  # 6 hours
    'email_writing': 0,      # No caching - each email should be unique
    'gatekeeper': 1800,      # 30 minutes
}

# Cache key prefixes
CACHE_PREFIX = {
    'compliance': 'ai:cache:compliance:',
    'business_analysis': 'ai:cache:analysis:',
    'entity_resolution': 'ai:cache:entities:',
    'gatekeeper': 'ai:cache:gatekeeper:',
}


@dataclass
class CacheStats:
    """Statistics for cache operations."""
    hits: int = 0
    misses: int = 0
    errors: int = 0
    last_hit_time: Optional[float] = None
    last_miss_time: Optional[float] = None


class AICache:
    """
    Redis-based cache for AI agent responses.

    Usage:
        cache = AICache()

        # Cache compliance check
        result = await cache.get_or_set(
            cache_type='compliance',
            key_data={'subject': subject, 'body': body},
            fetch_func=lambda: check_compliance(subject, body),
        )
    """

    def __init__(self, redis_url: str = REDIS_URL):
        self.redis_url = redis_url
        self._client: Optional[redis.Redis] = None
        self._stats: dict[str, CacheStats] = {
            key: CacheStats() for key in CACHE_PREFIX.keys()
        }

    async def _get_client(self) -> redis.Redis:
        """Get or create Redis client."""
        if self._client is None:
            self._client = redis.from_url(self.redis_url, decode_responses=True)
        return self._client

    @staticmethod
    def _generate_key(prefix: str, key_data: dict | str) -> str:
        """Generate a cache key from data."""
        if isinstance(key_data, str):
            data_str = key_data
        else:
            # Sort keys for consistent hashing
            data_str = json.dumps(key_data, sort_keys=True)

        # Use SHA256 hash to keep keys manageable
        hash_value = hashlib.sha256(data_str.encode()).hexdigest()[:32]
        return f"{prefix}{hash_value}"

    async def get(
        self,
        cache_type: str,
        key_data: dict | str,
    ) -> Optional[dict]:
        """
        Get a cached value.

        Args:
            cache_type: Type of cache (compliance, business_analysis, etc.)
            key_data: Data to generate cache key from

        Returns:
            Cached value as dict, or None if not found
        """
        if cache_type not in CACHE_PREFIX:
            logger.warn(f"Unknown cache type: {cache_type}")
            return None

        prefix = CACHE_PREFIX[cache_type]
        key = self._generate_key(prefix, key_data)

        try:
            client = await self._get_client()
            cached = await client.get(key)

            if cached:
                self._stats[cache_type].hits += 1
                self._stats[cache_type].last_hit_time = time.time()
                logger.debug(f"Cache hit", cache_type=cache_type, key=key[:20])
                return json.loads(cached)
            else:
                self._stats[cache_type].misses += 1
                self._stats[cache_type].last_miss_time = time.time()
                return None

        except Exception as e:
            self._stats[cache_type].errors += 1
            logger.warn(f"Cache get error: {str(e)}", cache_type=cache_type)
            return None

    async def set(
        self,
        cache_type: str,
        key_data: dict | str,
        value: dict | Any,
        ttl: Optional[int] = None,
    ) -> bool:
        """
        Set a cached value.

        Args:
            cache_type: Type of cache
            key_data: Data to generate cache key from
            value: Value to cache (will be JSON serialized)
            ttl: Optional custom TTL in seconds

        Returns:
            True if successful
        """
        if cache_type not in CACHE_PREFIX:
            return False

        prefix = CACHE_PREFIX[cache_type]
        key = self._generate_key(prefix, key_data)
        cache_ttl = ttl if ttl is not None else CACHE_TTL.get(cache_type, 3600)

        if cache_ttl <= 0:
            return False  # Caching disabled for this type

        try:
            client = await self._get_client()

            # Convert value to dict if it has model_dump method (Pydantic)
            if hasattr(value, 'model_dump'):
                value = value.model_dump()

            await client.setex(key, cache_ttl, json.dumps(value))
            logger.debug(f"Cache set", cache_type=cache_type, key=key[:20], ttl=cache_ttl)
            return True

        except Exception as e:
            self._stats[cache_type].errors += 1
            logger.warn(f"Cache set error: {str(e)}", cache_type=cache_type)
            return False

    async def get_or_set(
        self,
        cache_type: str,
        key_data: dict | str,
        fetch_func: Callable[[], Awaitable[T]],
        ttl: Optional[int] = None,
    ) -> T:
        """
        Get from cache or fetch and cache the result.

        Args:
            cache_type: Type of cache
            key_data: Data to generate cache key from
            fetch_func: Async function to call if cache miss
            ttl: Optional custom TTL

        Returns:
            Cached or freshly fetched value
        """
        # Try to get from cache first
        cached = await self.get(cache_type, key_data)
        if cached is not None:
            return cached

        # Cache miss - fetch fresh data
        result = await fetch_func()

        # Cache the result
        await self.set(cache_type, key_data, result, ttl)

        return result

    async def invalidate(
        self,
        cache_type: str,
        key_data: dict | str,
    ) -> bool:
        """Invalidate a specific cache entry."""
        if cache_type not in CACHE_PREFIX:
            return False

        prefix = CACHE_PREFIX[cache_type]
        key = self._generate_key(prefix, key_data)

        try:
            client = await self._get_client()
            await client.delete(key)
            logger.debug(f"Cache invalidated", cache_type=cache_type, key=key[:20])
            return True
        except Exception as e:
            logger.warn(f"Cache invalidate error: {str(e)}", cache_type=cache_type)
            return False

    async def clear_cache_type(self, cache_type: str) -> int:
        """Clear all entries of a specific cache type."""
        if cache_type not in CACHE_PREFIX:
            return 0

        prefix = CACHE_PREFIX[cache_type]

        try:
            client = await self._get_client()
            # Use SCAN to find keys (safer than KEYS in production)
            deleted = 0
            cursor = 0
            while True:
                cursor, keys = await client.scan(cursor, match=f"{prefix}*", count=100)
                if keys:
                    await client.delete(*keys)
                    deleted += len(keys)
                if cursor == 0:
                    break

            logger.info(f"Cache cleared", cache_type=cache_type, deleted=deleted)
            return deleted

        except Exception as e:
            logger.warn(f"Cache clear error: {str(e)}", cache_type=cache_type)
            return 0

    def get_stats(self) -> dict[str, dict]:
        """Get cache statistics."""
        return {
            cache_type: {
                'hits': stats.hits,
                'misses': stats.misses,
                'errors': stats.errors,
                'hit_rate': stats.hits / (stats.hits + stats.misses) if (stats.hits + stats.misses) > 0 else 0,
            }
            for cache_type, stats in self._stats.items()
        }

    async def close(self):
        """Close the Redis connection."""
        if self._client:
            await self._client.close()
            self._client = None


# Global cache instance
ai_cache = AICache()


# Convenience functions for common operations
async def cache_compliance_check(
    subject: str,
    body_text: str,
    fetch_func: Callable[[], Awaitable[Any]],
) -> Any:
    """
    Cache a compliance check result.

    Cache key is based on hash of subject + body_text.
    """
    key_data = {'subject': subject, 'body': body_text}
    return await ai_cache.get_or_set('compliance', key_data, fetch_func)


async def cache_business_analysis(
    business_id: str,
    evidence_hash: str,
    fetch_func: Callable[[], Awaitable[Any]],
) -> Any:
    """
    Cache a business analysis result.

    Cache key is based on business_id + hash of evidence.
    """
    key_data = {'business_id': business_id, 'evidence_hash': evidence_hash}
    return await ai_cache.get_or_set('business_analysis', key_data, fetch_func)


async def cache_gatekeeper_decision(
    confidence_score: int,
    deliverability_score: int,
    spam_flags_hash: str,
    needs_review: bool,
    fetch_func: Callable[[], Awaitable[Any]],
) -> Any:
    """
    Cache a gatekeeper decision.
    """
    key_data = {
        'confidence': confidence_score,
        'deliverability': deliverability_score,
        'flags_hash': spam_flags_hash,
        'needs_review': needs_review,
    }
    return await ai_cache.get_or_set('gatekeeper', key_data, fetch_func)


def hash_evidence(evidence: list[dict]) -> str:
    """Generate a hash for a list of evidence."""
    # Sort and serialize evidence for consistent hashing
    sorted_evidence = sorted(evidence, key=lambda e: e.get('id', ''))
    evidence_str = json.dumps(sorted_evidence, sort_keys=True)
    return hashlib.sha256(evidence_str.encode()).hexdigest()[:16]


def hash_spam_flags(spam_flags: list[str]) -> str:
    """Generate a hash for spam flags list."""
    sorted_flags = sorted(spam_flags)
    return hashlib.sha256(json.dumps(sorted_flags).encode()).hexdigest()[:16]


# Cache statistics endpoint
def get_cache_stats() -> dict:
    """Get global cache statistics."""
    return ai_cache.get_stats()
