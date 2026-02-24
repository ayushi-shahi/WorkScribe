"""
Application configuration using pydantic-settings.

All environment variables are defined here with type safety.
"""

from typing import Literal

from pydantic import Field, PostgresDsn, RedisDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Environment
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    DEBUG: bool = False

    # Database
    DATABASE_URL: PostgresDsn = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/workscribe",
        description="PostgreSQL connection URL with asyncpg driver",
    )

    # Redis
    REDIS_URL: RedisDsn = Field(
        default="redis://localhost:6379/0",
        description="Redis connection URL for cache and Celery broker",
    )

    # JWT Configuration
    JWT_SECRET_KEY: str = Field(
        min_length=32,
        description="Secret key for JWT token signing (min 32 chars)",
    )
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # OAuth - Google
    GOOGLE_CLIENT_ID: str = Field(
        default="",
        description="Google OAuth Client ID",
    )
    GOOGLE_CLIENT_SECRET: str = Field(
        default="",
        description="Google OAuth Client Secret",
    )
    GOOGLE_REDIRECT_URI: str = Field(
        default="http://localhost:8000/api/v1/auth/oauth/google/callback",
        description="Google OAuth redirect URI",
    )

    # Email
    RESEND_API_KEY: str = Field(
        default="",
        description="Resend API key for sending emails",
    )
    EMAIL_FROM: str = Field(
        default="noreply@workflow.dev",
        description="From email address",
    )

    # CORS
    CORS_ORIGINS: list[str] = Field(
        default=["http://localhost:5173", "http://localhost:3000"],
        description="Allowed CORS origins",
    )

    # Frontend URL
    FRONTEND_URL: str = Field(
        default="http://localhost:5173",
        description="Frontend application URL for email links",
    )

    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 100

    # Celery
    CELERY_BROKER_URL: str | None = None
    CELERY_RESULT_BACKEND: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    def __init__(self, **kwargs: object) -> None:
        """Initialize settings and set Celery URLs from Redis URL if not provided."""
        super().__init__(**kwargs)
        
        # Set Celery broker/backend to Redis URL if not explicitly provided
        if self.CELERY_BROKER_URL is None:
            self.CELERY_BROKER_URL = str(self.REDIS_URL)
        if self.CELERY_RESULT_BACKEND is None:
            self.CELERY_RESULT_BACKEND = str(self.REDIS_URL)


# Global settings instance
settings = Settings()