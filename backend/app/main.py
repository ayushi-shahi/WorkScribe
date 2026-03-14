"""
FastAPI application entry point.
Configures middleware, routes, and exception handlers.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import redis.asyncio as aioredis
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.rate_limit import RateLimitMiddleware
from app.routers.search import router as search_router
from app.routers.dashboard import router as dashboard_router
from app.routers.labels import router as labels_router



@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    print(f"🚀 Starting WorkScribe API in {settings.ENVIRONMENT} mode")

    # Initialise shared Redis connection for rate limiting + app use
    app.state.redis = aioredis.from_url(
    str(settings.REDIS_URL),
    encoding="utf-8",
    decode_responses=True,
    )

    yield

    # Graceful shutdown
    await app.state.redis.aclose()
    print("🛑 Shutting down WorkScribe API")


app = FastAPI(
    title="WorkScribe API",
    description="Multi-tenant work management platform",
    version="1.0.0",
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url="/api/redoc" if settings.DEBUG else None,
    openapi_url="/api/openapi.json" if settings.DEBUG else None,
    lifespan=lifespan,
)

# ── Middleware (order matters — added last runs first) ───────────────────────

app.add_middleware(RateLimitMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# ── Exception handlers ───────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    if settings.DEBUG:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "detail": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": str(exc),
                    "type": type(exc).__name__,
                }
            },
        )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected error occurred",
            }
        },
    )


# ── Core routes ──────────────────────────────────────────────────────────────

@app.get("/health", tags=["Health"])
async def health_check() -> dict[str, str]:
    return {
        "status": "ok",
        "environment": settings.ENVIRONMENT,
        "version": "1.0.0",
    }


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
