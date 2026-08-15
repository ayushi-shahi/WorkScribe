"""
Shared Redis client.

One client for the whole process. Previously the app built two independent
connection pools (one in the lifespan handler, one in dependencies.py), which
doubled the connection count against providers that cap it hard on the free
tier — a slow-burn failure that only shows up once traffic grows.

Every client here has explicit socket timeouts. Without them a dead or
unreachable Redis makes requests hang until the client gives up rather than
failing fast, which is how a Redis outage turns into a site-wide stall.
"""

from __future__ import annotations

import logging

import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: aioredis.Redis | None = None


def get_redis_client() -> aioredis.Redis:
    """Return the process-wide Redis client, creating it on first use."""
    global _client
    if _client is None:
        _client = aioredis.from_url(
            str(settings.REDIS_URL),
            encoding="utf-8",
            decode_responses=True,
            socket_timeout=settings.REDIS_SOCKET_TIMEOUT,
            socket_connect_timeout=settings.REDIS_CONNECT_TIMEOUT,
            socket_keepalive=True,
            health_check_interval=30,
            retry_on_timeout=True,
        )
    return _client


async def close_redis_client() -> None:
    """Close the shared client on shutdown."""
    global _client
    if _client is not None:
        try:
            await _client.aclose()
        except Exception as exc:  # pragma: no cover - shutdown best effort
            logger.warning("Error closing Redis client: %s", exc)
        _client = None


async def check_redis() -> tuple[bool, str | None]:
    """
    Ping Redis for health reporting.

    Returns (is_healthy, error_message).
    """
    try:
        await get_redis_client().ping()
        return True, None
    except Exception as exc:
        return False, f"{type(exc).__name__}: {exc}"
