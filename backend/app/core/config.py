"""
Application configuration using pydantic-settings.

All environment variables are defined here with type safety.
"""

import json
from typing import Literal

from pydantic import Field, PostgresDsn, RedisDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


def _parse_origin_list(raw: str) -> list[str]:
    """
    Parse an origins env var written as a JSON array, a comma-separated list,
    or a single bare origin. Trailing slashes are stripped because the browser
    never sends one in the Origin header, and a stored trailing slash silently
    breaks the match.
    """
    value = raw.strip()
    if not value:
        return []

    if value.startswith("["):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            parsed = []
        if isinstance(parsed, list):
            return [str(item).strip().rstrip("/") for item in parsed if str(item).strip()]

    return [part.strip().rstrip("/") for part in value.split(",") if part.strip()]


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

    # Database connection pool.
    # Managed free-tier Postgres (Supabase/Neon/Render) allows very few
    # connections. The old 10+20 default silently exhausted them once more than
    # one worker was running, which surfaces as random 500s under light load.
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 5
    DB_POOL_RECYCLE: int = 1800
    DB_POOL_TIMEOUT: int = 30
    DB_CONNECT_TIMEOUT: int = 10
    DB_USE_PGBOUNCER: bool = Field(
        default=False,
        description=(
            "Set true when DATABASE_URL points at a transaction-mode pooler "
            "(Supabase :6543, PgBouncer). Disables asyncpg prepared-statement "
            "caching, which is incompatible with transaction pooling."
        ),
    )

    # Redis
    REDIS_URL: RedisDsn = Field(
        default="redis://localhost:6379/0",
        description="Redis connection URL for cache and Celery broker",
    )
    REDIS_SOCKET_TIMEOUT: int = Field(
        default=5,
        description="Seconds to wait on a Redis command before giving up",
    )
    REDIS_CONNECT_TIMEOUT: int = Field(
        default=5,
        description="Seconds to wait when establishing a Redis connection",
    )

    # Logging
    LOG_LEVEL: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"

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

    # Email - Brevo
    BREVO_API_KEY: str = Field(
        default="",
        description="Brevo API key for sending transactional emails",
    )
    EMAIL_FROM: str = Field(
        default="noreply@workscribe.app",
        description="From email address",
    )

    # CORS
    #
    # Declared as a plain string, not list[str]. pydantic-settings json.loads()
    # any list-typed env var and raises at import time if it is not valid JSON,
    # so setting CORS_ORIGINS=https://work-scribe.vercel.app on the host would
    # crash the process on boot. Reading it as a string and parsing it in
    # `CORS_ORIGINS` below accepts a bare origin, a comma-separated list, and a
    # JSON array alike.
    CORS_ORIGINS_RAW: str = Field(
        default="http://localhost:5173,http://localhost:3000",
        validation_alias="CORS_ORIGINS",
        description="Allowed CORS origins: JSON array, comma-separated, or single origin",
    )

    @property
    def CORS_ORIGINS(self) -> list[str]:
        """Allowed CORS origins, parsed from CORS_ORIGINS_RAW."""
        return _parse_origin_list(self.CORS_ORIGINS_RAW)

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