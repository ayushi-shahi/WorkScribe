"""
Redis-based rate limiting middleware.

Limits each IP to 100 requests per 60-second sliding window.
Returns 429 Too Many Requests when the limit is exceeded.
"""

from __future__ import annotations

import json
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# Routes exempt from rate limiting (health check)
EXEMPT_PATHS = {"/health"}

RATE_LIMIT = 100        # max requests
WINDOW_SECONDS = 60     # per minute


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[override]
        if request.url.path in EXEMPT_PATHS:
            return await call_next(request)

        # Get Redis from app state (set during startup)
        redis = request.app.state.redis
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

            if current > RATE_LIMIT:
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
        except Exception:
            # Redis error — fail open
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