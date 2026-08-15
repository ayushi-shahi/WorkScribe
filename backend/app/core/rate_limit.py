"""
Redis-based rate limiting middleware.

Limits each IP to 100 requests per 60-second sliding window.
Returns 429 Too Many Requests when the limit is exceeded.
"""

from __future__ import annotations

import json
import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings

logger = logging.getLogger(__name__)

# Routes exempt from rate limiting (health checks + CORS preflight)
EXEMPT_PATHS = {"/health", "/health/ready"}

WINDOW_SECONDS = 60     # per minute


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[override]
        if request.url.path in EXEMPT_PATHS:
            return await call_next(request)

        # Never rate-limit preflight: a 429 on OPTIONS carries no CORS headers
        # and the browser reports it as a CORS failure.
        if request.method == "OPTIONS":
            return await call_next(request)

        # Get Redis from app state (set during startup)
        redis = getattr(request.app.state, "redis", None)
        if redis is None:
            # Redis unavailable — fail open, don't block traffic
            return await call_next(request)

        ip = _get_client_ip(request)
        key = f"rate_limit:{ip}"

        try:
            current = await redis.incr(key)
            if current == 1:
                # First request in window — set expiry
                await redis.expire(key, WINDOW_SECONDS)

            if current > settings.RATE_LIMIT_PER_MINUTE:
                ttl = await redis.ttl(key)
                return Response(
                    content=json.dumps({
                        "detail": {
                            "code": "RATE_LIMIT_EXCEEDED",
                            "message": f"Too many requests. Try again in {ttl} seconds.",
                        }
                    }),
                    status_code=429,
                    media_type="application/json",
                    headers={"Retry-After": str(ttl)},
                )
        except Exception as exc:
            # Redis error — fail open so an outage never blocks traffic, but
            # log it: silent fail-open is why a dead Redis went unnoticed.
            logger.warning("Rate limiter bypassed, Redis error: %s", exc)
            return await call_next(request)

        response = await call_next(request)
        return response


def _get_client_ip(request: Request) -> str:
    """Extract real client IP, respecting X-Forwarded-For for proxied deployments."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # Take the first (leftmost) IP — the original client
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"