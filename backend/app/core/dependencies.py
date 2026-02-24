"""
FastAPI dependency injection functions.

Provides database sessions, current user, Redis connections, role enforcement.
"""

from __future__ import annotations

from uuid import UUID

import redis.asyncio as aioredis
from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import blacklist_redis_key, decode_access_token
from app.models.member import OrgMember, OrgRole
from app.models.organization import Organization
from app.models.user import User

# ---------------------------------------------------------------------------
# HTTP Bearer scheme (auto_error=False so we can return custom 401)
# ---------------------------------------------------------------------------

bearer_scheme = HTTPBearer(auto_error=False)

# ---------------------------------------------------------------------------
# Redis
# ---------------------------------------------------------------------------

_redis_pool: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    """
    Return a shared async Redis client.

    Uses a module-level pool so connections are reused across requests.
    """
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = aioredis.from_url(
            str(settings.REDIS_URL),
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis_pool


# ---------------------------------------------------------------------------
# Current user
# ---------------------------------------------------------------------------

async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> User:
    """
    Validate Bearer JWT and return the authenticated User.

    Raises 401 if:
    - No token provided
    - Token is invalid or expired
    - JTI is blacklisted
    - User does not exist or is inactive
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "MISSING_TOKEN", "message": "Authorization header required"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    try:
        payload = decode_access_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_TOKEN", "message": "Token is invalid or expired"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id: str = payload.get("sub", "")
    jti: str = payload.get("jti", "")

    # Check blacklist
    is_blacklisted = await redis.exists(blacklist_redis_key(jti))
    if is_blacklisted:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "TOKEN_REVOKED", "message": "Token has been revoked"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Load user
    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "USER_NOT_FOUND", "message": "User not found or inactive"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


# ---------------------------------------------------------------------------
# WebSocket current user (token via query param)
# ---------------------------------------------------------------------------

async def get_current_user_ws(
    token: str = Query(..., description="JWT access token"),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> User:
    """
    Validate JWT from WebSocket query parameter.

    Used for WS /api/v1/ws?token=...
    """
    try:
        payload = decode_access_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_TOKEN", "message": "Token is invalid or expired"},
        )

    user_id: str = payload.get("sub", "")
    jti: str = payload.get("jti", "")

    is_blacklisted = await redis.exists(blacklist_redis_key(jti))
    if is_blacklisted:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "TOKEN_REVOKED", "message": "Token has been revoked"},
        )

    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "USER_NOT_FOUND", "message": "User not found or inactive"},
        )

    return user


# ---------------------------------------------------------------------------
# Organization membership + role enforcement
# ---------------------------------------------------------------------------

async def get_org_member(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> tuple[Organization, OrgMember]:
    """
    Resolve org by slug and verify current user is a member.

    Returns (organization, org_member) tuple.
    Raises 404 if org not found, 403 if user is not a member.
    """
    result = await db.execute(
        select(Organization).where(Organization.slug == slug)
    )
    org = result.scalar_one_or_none()

    if org is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ORG_NOT_FOUND", "message": "Organization not found"},
        )

    member_result = await db.execute(
        select(OrgMember).where(
            OrgMember.org_id == org.id,
            OrgMember.user_id == current_user.id,
        )
    )
    member = member_result.scalar_one_or_none()

    if member is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "NOT_A_MEMBER", "message": "You are not a member of this organization"},
        )

    return org, member


def require_role(*roles: OrgRole):
    """
    Dependency factory that enforces a minimum role.

    Usage:
        @router.post("/...")
        async def endpoint(
            org_and_member: tuple = Depends(get_org_member),
            _: None = Depends(require_role(OrgRole.admin, OrgRole.owner)),
        ):
            org, member = org_and_member
    """
    async def role_checker(
        org_and_member: tuple[Organization, OrgMember] = Depends(get_org_member),
    ) -> tuple[Organization, OrgMember]:
        _, member = org_and_member
        if member.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "INSUFFICIENT_ROLE",
                    "message": f"Required role: {[r.value for r in roles]}",
                },
            )
        return org_and_member

    return role_checker