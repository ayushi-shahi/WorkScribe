"""
FastAPI application entry point.

Configures middleware, routes, and exception handlers.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan manager.

    Handles startup and shutdown events.
    """
    # Startup
    print(f"🚀 Starting WorkScribe API in {settings.ENVIRONMENT} mode")
    
    yield
    
    # Shutdown
    print("🛑 Shutting down WorkScribe API")


# Create FastAPI application
app = FastAPI(
    title="WorkScribe API",
    description="Multi-tenant work management platform",
    version="1.0.0",
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url="/api/redoc" if settings.DEBUG else None,
    openapi_url="/api/openapi.json" if settings.DEBUG else None,
    lifespan=lifespan,
)


# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# Global exception handler for unexpected errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Handle all unhandled exceptions.

    Returns structured JSON error response.
    """
    if settings.DEBUG:
        # In debug mode, include exception details
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
    
    # In production, return generic error
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected error occurred",
            }
        },
    )


# Health check endpoint
@app.get("/health", tags=["Health"])
async def health_check() -> dict[str, str]:
    """
    Health check endpoint.

    Returns 200 OK if the service is running.
    """
    return {
        "status": "ok",
        "environment": settings.ENVIRONMENT,
        "version": "1.0.0",
    }


# Root endpoint
@app.get("/", tags=["Root"])
async def root() -> dict[str, str]:
    """
    Root endpoint.

    Returns API information.
    """
    return {
        "message": "WorkScribe API",
        "version": "1.0.0",
        "docs": "/api/docs" if settings.DEBUG else "disabled",
    }



# Include routers (will be added as we build them)
from app.routers import auth, organizations, projects, tasks, sprints, pages, search, notifications, websocket
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(organizations.router, prefix="/api/v1/organizations", tags=["Organizations"])
app.include_router(projects.router, prefix="/api/v1", tags=["Projects"])# app.include_router(tasks.router, prefix="/api/v1/tasks", tags=["Tasks"])
# app.include_router(sprints.router, prefix="/api/v1/sprints", tags=["Sprints"])
# app.include_router(pages.router, prefix="/api/v1/wiki", tags=["Wiki"])
# app.include_router(search.router, prefix="/api/v1", tags=["Search"])
# app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["Notifications"])
# app.include_router(websocket.router, prefix="/api/v1", tags=["WebSocket"])