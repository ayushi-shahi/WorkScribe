"""
FastAPI application entry point.
Configures middleware, routes, and exception handlers.
"""

import logging
import uuid
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.core.database import check_db
from app.core.logging import configure_logging
from app.core.rate_limit import RateLimitMiddleware
from app.core.redis_client import check_redis, close_redis_client, get_redis_client
from app.routers.search import router as search_router
from app.routers.dashboard import router as dashboard_router
from app.routers.labels import router as labels_router

configure_logging()
logger = logging.getLogger(__name__)


class CoopMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["Cross-Origin-Opener-Policy"] = "unsafe-none"
        return response


class ExceptionHandlingMiddleware(BaseHTTPMiddleware):
    """
    Convert unhandled exceptions into JSON responses *inside* the CORS layer.

    Starlette's own 500 handler (ServerErrorMiddleware) sits outside every
    middleware including CORSMiddleware, so a crash produced a 500 with no
    Access-Control-Allow-Origin header. The browser then reported it as a CORS
    policy error and hid the real failure — which is exactly why a dead
    database looked like a CORS misconfiguration.

    Returning the response from here lets CORSMiddleware, which wraps this one,
    attach the correct headers so the frontend can read the actual error.
    """

    async def dispatch(self, request: Request, call_next):
        try:
            return await call_next(request)
        except Exception as exc:
            error_id = uuid.uuid4().hex[:12]
            logger.exception(
                "Unhandled error [%s] %s %s", error_id, request.method, request.url.path
            )
            content: dict[str, object] = {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected error occurred",
                "error_id": error_id,
            }
            if settings.DEBUG:
                content["message"] = str(exc)
                content["type"] = type(exc).__name__
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={"detail": content},
            )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("Starting WorkScribe API in %s mode", settings.ENVIRONMENT)

    # Shared Redis client for rate limiting + app use
    app.state.redis = get_redis_client()

    # Report dependency health at boot so a dead/expired database or Redis is
    # visible in the deploy logs instead of surfacing as a user-facing 500.
    db_ok, db_err = await check_db()
    if db_ok:
        logger.info("Database connection OK")
    else:
        logger.error("Database UNREACHABLE at startup: %s", db_err)

    redis_ok, redis_err = await check_redis()
    if redis_ok:
        logger.info("Redis connection OK")
    else:
        logger.error("Redis UNREACHABLE at startup: %s", redis_err)

    if not settings.CORS_ORIGINS:
        logger.warning("CORS_ORIGINS is empty — browser requests will be blocked")

    yield

    await close_redis_client()
    logger.info("Shutting down WorkScribe API")


app = FastAPI(
    title="WorkScribe API",
    description="Multi-tenant work management platform",
    version="1.0.0",
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url="/api/redoc" if settings.DEBUG else None,
    openapi_url="/api/openapi.json" if settings.DEBUG else None,
    lifespan=lifespan,
)

# ── Middleware ───────────────────────────────────────────────────────────────
# add_middleware prepends, so the LAST one added is the outermost layer.
# Resulting order: CORS → ExceptionHandling → RateLimit → Coop → routes.
# CORS must stay outermost so its headers are attached to every response,
# including the 500s produced by ExceptionHandlingMiddleware.
app.add_middleware(CoopMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(ExceptionHandlingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# ── Exception handlers ───────────────────────────────────────────────────────
# Backstop only: ExceptionHandlingMiddleware catches route errors first. This
# still covers failures raised outside the middleware stack.

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    error_id = uuid.uuid4().hex[:12]
    logger.exception(
        "Unhandled error [%s] %s %s", error_id, request.method, request.url.path
    )
    content: dict[str, object] = {
        "code": "INTERNAL_SERVER_ERROR",
        "message": str(exc) if settings.DEBUG else "An unexpected error occurred",
        "error_id": error_id,
    }
    if settings.DEBUG:
        content["type"] = type(exc).__name__
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": content},
    )


# ── Core routes ──────────────────────────────────────────────────────────────

@app.get("/health", tags=["Health"])
async def health_check() -> dict[str, str]:
    """
    Liveness probe — is the process up?

    Deliberately does not touch the database or Redis so a dependency outage
    does not cause the platform to restart-loop a healthy process.
    Use /health/ready to check dependencies.
    """
    return {
        "status": "ok",
        "environment": settings.ENVIRONMENT,
        "version": "1.0.0",
    }


@app.get("/health/ready", tags=["Health"])
async def readiness_check() -> JSONResponse:
    """
    Readiness probe — are the database and Redis actually reachable?

    Returns 503 when a dependency is down, with the failing component named.
    This is the endpoint to check first when the app misbehaves: it turns
    "login returns 500" into "the database is gone".
    """
    db_ok, db_err = await check_db()
    redis_ok, redis_err = await check_redis()

    checks: dict[str, object] = {
        "database": {"ok": db_ok, **({"error": db_err} if db_err else {})},
        "redis": {"ok": redis_ok, **({"error": redis_err} if redis_err else {})},
    }
    all_ok = db_ok and redis_ok

    return JSONResponse(
        status_code=status.HTTP_200_OK if all_ok else status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "status": "ready" if all_ok else "degraded",
            "environment": settings.ENVIRONMENT,
            "version": "1.0.0",
            "checks": checks,
        },
    )


@app.get("/", tags=["Root"])
async def root() -> dict[str, str]:
    return {
        "message": "WorkScribe API",
        "version": "1.0.0",
        "docs": "/api/docs" if settings.DEBUG else "disabled",
    }


# ── Routers ──────────────────────────────────────────────────────────────────

from app.routers import (  # noqa: E402
    auth,
    notifications,
    organizations,
    pages,
    projects,
    sprints,
    tasks,
    websocket,
)
from app.routers import task_page_links  # noqa: E402

app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(organizations.router, prefix="/api/v1/organizations", tags=["Organizations"])
app.include_router(projects.router, prefix="/api/v1", tags=["Projects"])
app.include_router(tasks.router, prefix="/api/v1", tags=["Tasks"])
app.include_router(sprints.router, prefix="/api/v1", tags=["Sprints"])
app.include_router(pages.router, prefix="/api/v1", tags=["Wiki"])
app.include_router(task_page_links.router, prefix="/api/v1", tags=["Links"])
app.include_router(notifications.router, prefix="/api/v1", tags=["Notifications"])
app.include_router(websocket.router, prefix="/api/v1", tags=["WebSocket"])
app.include_router(search_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")
app.include_router(labels_router, prefix="/api/v1")
