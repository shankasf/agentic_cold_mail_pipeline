"""
Database connection layer for the chatbot using asyncpg.
Provides direct PostgreSQL access for high-performance queries.
"""

import os
import asyncpg
from typing import Optional
from contextlib import asynccontextmanager

# Global connection pool
_pool: Optional[asyncpg.Pool] = None


def get_database_url() -> str:
    """Get database URL from environment."""
    url = os.environ.get('DATABASE_URL')
    if not url:
        # Try to construct from components
        host = os.environ.get('POSTGRES_HOST', 'localhost')
        port = os.environ.get('POSTGRES_PORT', '5432')
        user = os.environ.get('POSTGRES_USER', 'postgres')
        password = os.environ.get('POSTGRES_PASSWORD', 'postgres')
        database = os.environ.get('POSTGRES_DB', 'email_marketing')
        url = f"postgresql://{user}:{password}@{host}:{port}/{database}"
    return url


async def init_pool() -> asyncpg.Pool:
    """Initialize the connection pool."""
    global _pool
    if _pool is None:
        url = get_database_url()
        _pool = await asyncpg.create_pool(
            url,
            min_size=2,
            max_size=10,
            command_timeout=60
        )
    return _pool


async def get_pool() -> asyncpg.Pool:
    """Get the connection pool, initializing if needed."""
    if _pool is None:
        await init_pool()
    return _pool


async def close_pool():
    """Close the connection pool."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def get_connection():
    """Get a database connection from the pool."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        yield conn


async def fetch_one(query: str, *args) -> Optional[dict]:
    """Execute a query and return one row as a dict."""
    async with get_connection() as conn:
        row = await conn.fetchrow(query, *args)
        return dict(row) if row else None


async def fetch_all(query: str, *args) -> list[dict]:
    """Execute a query and return all rows as dicts."""
    async with get_connection() as conn:
        rows = await conn.fetch(query, *args)
        return [dict(row) for row in rows]


async def execute(query: str, *args) -> str:
    """Execute a query and return the status."""
    async with get_connection() as conn:
        return await conn.execute(query, *args)
