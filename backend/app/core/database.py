"""
Database configuration and session management.

Async SQLAlchemy engine and session factory.
"""

from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

# asyncpg-specific connect args.
#
# `timeout` bounds connection establishment so a dead database fails fast
# instead of holding the request open.
#
# When DATABASE_URL points at a transaction-mode pooler (Supabase's :6543 port,
# PgBouncer), asyncpg's prepared-statement cache must be disabled: the pooler
# hands each transaction a different backend, so cached statement names go stale
# and raise InvalidSQLStatementName / DuplicatePreparedStatement at random.
_connect_args: dict[str, Any] = {"timeout": settings.DB_CONNECT_TIMEOUT}
if settings.DB_USE_PGBOUNCER:
    _connect_args["statement_cache_size"] = 0
    _connect_args["prepared_statement_cache_size"] = 0

# Create async engine
async_engine = create_async_engine(
    str(settings.DATABASE_URL),
    echo=settings.DEBUG,
    pool_pre_ping=True,          # drops connections killed by an idle sleep
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_recycle=settings.DB_POOL_RECYCLE,
    pool_timeout=settings.DB_POOL_TIMEOUT,
    connect_args=_connect_args,
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency for database sessions.

    Yields an async database session and handles commit/rollback.

    Usage:
        @router.get("/endpoint")
        async def endpoint(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def check_db() -> tuple[bool, str | None]:
    """
    Run a trivial query to confirm the database is actually reachable.

    Returns (is_healthy, error_message). Used by the readiness probe so a
    deleted or expired database is reported instead of being discovered only
    when a user tries to log in.
    """
    try:
        async with async_engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True, None
    except Exception as exc:
        return False, f"{type(exc).__name__}: {exc}"
