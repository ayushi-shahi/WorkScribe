"""
Authentication business logic.

Handles user registration, login, token refresh, logout, password reset.
All business logic lives here — routers only handle HTTP concerns.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import redis.asyncio as aioredis
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    blacklist_redis_key,
    create_access_token,
    create_password_reset_token,
    create_refresh_token,
    hash_password,
    password_reset_redis_key,
    refresh_token_redis_key,
    verify_password,
)
from app.models.member import OrgMember, OrgRole
from app.models.organization import Organization
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    MeResponse,
    RegisterRequest,
    TokenResponse,
)


class AuthService:
    """Handles all authentication operations."""

    def __init__(self, db: AsyncSession, redis: aioredis.Redis) -> None:
        self.db = db
        self.redis = redis

    # -----------------------------------------------------------------------
    # Register
    # -----------------------------------------------------------------------

    async def register(self, data: RegisterRequest) -> TokenResponse:
        """
        Register a new user.

        - Validates email uniqueness
        - Hashes password
        - Creates user record
        - Issues JWT tokens

        Returns TokenResponse with access + refresh tokens.
        """
        # Check email uniqueness
        existing = await self.db.execute(
            select(User).where(User.email == data.email.lower())
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "EMAIL_TAKEN", "message": "Email is already registered"},
            )

        # Create user
        user = User(
            email=data.email.lower(),
            password_hash=hash_password(data.password),
            display_name=data.display_name,
            email_verified=False,
        )
        self.db.add(user)
        await self.db.flush()  # Get user.id without committing

        # Issue tokens
        return await self._issue_tokens(user)

    # -----------------------------------------------------------------------
    # Login
    # -----------------------------------------------------------------------

    async def login(self, data: LoginRequest) -> TokenResponse:
        """
        Authenticate user with email + password.

        Returns TokenResponse with access + refresh tokens.
        Raises 401 for invalid credentials (never reveals which field is wrong).
        """
        result = await self.db.execute(
            select(User).where(User.email == data.email.lower())
        )
        user = result.scalar_one_or_none()

        if user is None or user.password_hash is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_CREDENTIALS", "message": "Invalid email or password"},
            )

        if not verify_password(data.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_CREDENTIALS", "message": "Invalid email or password"},
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "ACCOUNT_DISABLED", "message": "Account is disabled"},
            )

        return await self._issue_tokens(user)

    # -----------------------------------------------------------------------
    # Refresh
    # -----------------------------------------------------------------------

    async def refresh(self, refresh_token: str) -> TokenResponse:
        """
        Exchange a valid refresh token for a new token pair.

        - Validates refresh token JWT
        - Checks token exists in Redis
        - Rotates: deletes old refresh token, issues new pair
        """
        from jose import JWTError

        from app.core.security import decode_refresh_token

        try:
            payload = decode_refresh_token(refresh_token)
        except JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_TOKEN", "message": "Refresh token is invalid or expired"},
            )

        user_id: str = payload.get("sub", "")
        jti: str = payload.get("jti", "")

        # Check token exists in Redis
        redis_key = refresh_token_redis_key(user_id, jti)
        exists = await self.redis.exists(redis_key)
        if not exists:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "TOKEN_REVOKED", "message": "Refresh token has been revoked"},
            )

        # Load user
        from uuid import UUID
        result = await self.db.execute(select(User).where(User.id == UUID(user_id)))
        user = result.scalar_one_or_none()

        if user is None or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "USER_NOT_FOUND", "message": "User not found or inactive"},
            )

        # Rotate: delete old refresh token
        await self.redis.delete(redis_key)

        # Issue new token pair
        return await self._issue_tokens(user)

    # -----------------------------------------------------------------------
    # Logout
    # -----------------------------------------------------------------------

    async def logout(self, access_token_jti: str, refresh_token: str) -> None:
        """
        Logout user by:
        - Blacklisting the access token JTI
        - Deleting the refresh token from Redis
        """
        from jose import JWTError

        from app.core.security import decode_refresh_token

        # Blacklist access token JTI
        await self.redis.setex(
            blacklist_redis_key(access_token_jti),
            settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "1",
        )

        # Delete refresh token from Redis
        try:
            payload = decode_refresh_token(refresh_token)
            user_id: str = payload.get("sub", "")
            jti: str = payload.get("jti", "")
            await self.redis.delete(refresh_token_redis_key(user_id, jti))
        except JWTError:
            # Refresh token may already be expired — that's fine
            pass

    # -----------------------------------------------------------------------
    # Forgot Password
    # -----------------------------------------------------------------------

    async def forgot_password(self, email: str) -> None:
        """
        Initiate password reset flow.

        Always returns successfully to prevent user enumeration.
        Queues email via Celery if user exists.
        """
        result = await self.db.execute(
            select(User).where(User.email == email.lower())
        )
        user = result.scalar_one_or_none()

        if user is None:
            # Silent success — no user enumeration
            return

        # Generate reset token and store in Redis (1-hour TTL)
        token = create_password_reset_token()
        await self.redis.setex(
            password_reset_redis_key(token),
            3600,  # 1 hour
            str(user.id),
        )

        # Queue email task
        from app.workers.email_tasks import send_password_reset_email
        send_password_reset_email.delay(
            to_email=user.email,
            reset_token=token,
            frontend_url=settings.FRONTEND_URL,
        )

    # -----------------------------------------------------------------------
    # Reset Password
    # -----------------------------------------------------------------------

    async def reset_password(self, token: str, new_password: str) -> None:
        """
        Complete password reset.

        - Validates token from Redis
        - Updates user password
        - Deletes token from Redis
        """
        from uuid import UUID

        redis_key = password_reset_redis_key(token)
        user_id_str = await self.redis.get(redis_key)

        if user_id_str is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "INVALID_TOKEN", "message": "Reset token is invalid or expired"},
            )

        result = await self.db.execute(
            select(User).where(User.id == UUID(user_id_str))
        )
        user = result.scalar_one_or_none()

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "USER_NOT_FOUND", "message": "User not found"},
            )

        # Update password
        user.password_hash = hash_password(new_password)
        await self.db.flush()

        # Delete used token
        await self.redis.delete(redis_key)

    # -----------------------------------------------------------------------
    # Get current user (me)
    # -----------------------------------------------------------------------

    async def get_me(self, user: User) -> MeResponse:
        """Return current user profile."""
        return MeResponse.model_validate(user)

    # -----------------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------------

    async def _issue_tokens(self, user: User) -> TokenResponse:
        """
        Create and store access + refresh token pair for a user.

        Stores refresh token JTI in Redis with TTL.
        Returns TokenResponse.
        """
        user_id = str(user.id)

        refresh_token, refresh_jti = create_refresh_token(user_id)
        access_token = create_access_token(user_id)

        # Store refresh token in Redis
        ttl_seconds = settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
        await self.redis.setex(
            refresh_token_redis_key(user_id, refresh_jti),
            ttl_seconds,
            "1",
        )

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )