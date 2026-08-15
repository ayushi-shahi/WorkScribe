"""
Redis-based rate limiting middleware.

Two layers:

  * a global per-IP budget across the whole API, and
  * much tighter per-IP budgets on the authentication endpoints.

The global limit alone is useless against credential stuffing: 100 requests a
minute is ~144,000 password guesses a day from a single IP. The auth endpoints
need their own, far smaller budget.

Fails open. If Redis is unavailable the request is allowed through and a
warning is logged — losing the whole site because the cache is down is worse
than briefly losing rate limiting.
"""

from __future__ import annotations

import json
import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings

logger = logging.getLogger(__name__)

# Routes exempt from rate limiting (health checks)
EXEMPT_PATHS = {"/health", "/health/ready"}

WINDOW_SECONDS = 60  # global window

# path -> (max_requests, window_seconds). Applied in addition to the global
# budget, keyed separately so normal browsing never consumes the auth budget.
STRICT_LIMITS: dict[str, tuple[int, int]] = {
    # Password guessing. 10 attempts per 5 minutes per IP.
    "/api/v1/auth/login": (10, 300),
    # Account-farming and mail-bombing an address.
    "/api/v1/auth/register": (5, 3600),
    "/api/v1/auth/forgot-password": (5, 3600),
    # Reset-token guessing.
    "/api/v1/auth/reset-password": (10, 3600),
    # Google verifies the token for us, so this can be looser.
    "/api/v1/auth/oauth/google": (20, 300),
}


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[override]
        path = request.url.path

        if path in EXEMPT_PATHS:
            return await call_next(request)

        # Never rate-limit preflight: a 429 on OPTIONS carries no CORS headers
        # and the browser reports it as a CORS failure.
        if request.method == "OPTIONS":
            return await call_next(request)

        redis = getattr(request.app.state, "redis", None)
        if redis is None:
            return await call_next(request)

        ip = _get_client_ip(request)

        # Buckets to charge this request against, tightest first so the most
        # specific limit is the one reported to the client.
        buckets: list[tuple[str, int, int]] = []
        strict = STRICT_LIMITS.get(path)
        if strict is not None:
            buckets.append((f"rl:auth:{path}:{ip}", strict[0], strict[1]))
        buckets.append((f"rate_limit:{ip}", settings.RATE_LIMIT_PER_MINUTE, WINDOW_SECONDS))

        try:
            for key, limit, window in buckets:
                current = await redis.incr(key)
                if current == 1:
                    await redis.expire(key, window)
                if current > limit:
                    ttl = await redis.ttl(key)
                    retry_after = ttl if ttl and ttl > 0 else window
                    logger.warning(
                        "Rate limit hit: ip=%s path=%s bucket=%s", ip, path, key
                    )
                    return _too_many_requests(retry_after)
        except Exception as exc:
            # Redis error — fail open, but log it. A silent fail-open is how a
            # dead Redis went unnoticed for months.
            logger.warning("Rate limiter bypassed, Redis error: %s", exc)
            return await call_next(request)

        return await call_next(request)


def _too_many_requests(retry_after: int) -> Response:
    return Response(
        content=json.dumps(
            {
                "detail": {
                    "code": "RATE_LIMIT_EXCEEDED",
                    "message": f"Too many requests. Try again in {retry_after} seconds.",
                }
            }
        ),
        status_code=429,
        media_type="application/json",
        headers={"Retry-After": str(retry_after)},
    )


def _get_client_ip(request: Request) -> str:
    """Extract real client IP, respecting X-Forwarded-For for proxied deployments."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # Take the first (leftmost) IP — the original client
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
