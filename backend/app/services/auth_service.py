"""
Authentication business logic.

Handles user registration, login, token refresh, logout, password reset.
All business logic lives here — routers only handle HTTP concerns.
"""

from __future__ import annotations

import logging

import redis.asyncio as aioredis
from fastapi import BackgroundTasks, HTTPException, status
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
from app.models.user import User
from app.schemas.auth import (
    AuthUser,
    LoginRequest,
    MeResponse,
    RegisterRequest,
    TokenResponse,
)

logger = logging.getLogger(__name__)

# Per-account login throttle.
#
# The middleware caps attempts per IP, which stops a single host hammering one
# password list. It does nothing about credential stuffing spread across many
# IPs against one account, so failures are also counted per email address.
#
# The threshold is deliberately generous: a low one would let anyone lock a
# known user out of their own account by failing on purpose. This raises the
# cost of an attack without handing out a denial-of-service primitive.
FAILED_LOGIN_MAX = 15
FAILED_LOGIN_WINDOW = 900  # 15 minutes


def _login_fail_key(email: str) -> str:
    return f"login_fail:{email.lower()}"


class AuthService:
    """Handles all authentication operations."""

    def __init__(self, db: AsyncSession, redis: aioredis.Redis, background_tasks: BackgroundTasks | None = None) -> None:
        self.db = db
        self.redis = redis
        self.background_tasks = background_tasks

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
        await self._assert_not_throttled(data.email)

        result = await self.db.execute(
            select(User).where(User.email == data.email.lower())
        )
        user = result.scalar_one_or_none()

        if user is None or user.password_hash is None:
            await self._record_login_failure(data.email)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_CREDENTIALS", "message": "Invalid email or password"},
            )

        if not verify_password(data.password, user.password_hash):
            await self._record_login_failure(data.email)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_CREDENTIALS", "message": "Invalid email or password"},
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "ACCOUNT_DISABLED", "message": "Account is disabled"},
            )

        await self._clear_login_failures(data.email)
        return await self._issue_tokens(user)

    # -----------------------------------------------------------------------
    # Login throttling helpers — all best-effort, Redis outages must not
    # prevent anyone from signing in.
    # -----------------------------------------------------------------------

    async def _assert_not_throttled(self, email: str) -> None:
        try:
            raw = await self.redis.get(_login_fail_key(email))
        except Exception as exc:
            logger.warning("Login throttle check skipped, Redis unavailable: %s", exc)
            return

        if raw is not None and int(raw) >= FAILED_LOGIN_MAX:
            try:
                ttl = await self.redis.ttl(_login_fail_key(email))
            except Exception:
                ttl = FAILED_LOGIN_WINDOW
            retry_after = ttl if ttl and ttl > 0 else FAILED_LOGIN_WINDOW
            logger.warning("Login throttled for %s", email.lower())
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "code": "TOO_MANY_ATTEMPTS",
                    "message": (
                        "Too many failed sign-in attempts. "
                        f"Try again in {retry_after // 60 + 1} minutes."
                    ),
                },
                headers={"Retry-After": str(retry_after)},
            )

    async def _record_login_failure(self, email: str) -> None:
        key = _login_fail_key(email)
        try:
            count = await self.redis.incr(key)
            if count == 1:
                await self.redis.expire(key, FAILED_LOGIN_WINDOW)
        except Exception as exc:
            logger.warning("Could not record failed login: %s", exc)

    async def _clear_login_failures(self, email: str) -> None:
        try:
            await self.redis.delete(_login_fail_key(email))
        except Exception:
            pass

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

        # Check token exists in Redis.
        #
        # Only treat a *reachable* Redis reporting a missing key as revocation.
        # If Redis itself is unreachable we cannot distinguish "revoked" from
        # "store is down", and rejecting here would sign every user out of the
        # app the moment a free-tier Redis is recycled. The JWT signature and
        # expiry have already been verified above, so failing open is bounded.
        redis_key = refresh_token_redis_key(user_id, jti)
        redis_available = True
        try:
            exists = await self.redis.exists(redis_key)
        except Exception as exc:
            logger.warning("Refresh token check skipped, Redis unavailable: %s", exc)
            redis_available = False
            exists = False

        if redis_available and not exists:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "TOKEN_REVOKED", "message": "Refresh token has been revoked"},
            )

        # Load user
        from uuid import UUID

        try:
            user_uuid = UUID(user_id)
        except (ValueError, AttributeError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_TOKEN", "message": "Refresh token is invalid or expired"},
            )

        result = await self.db.execute(select(User).where(User.id == user_uuid))
        user = result.scalar_one_or_none()

        if user is None or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "USER_NOT_FOUND", "message": "User not found or inactive"},
            )

        # Rotate: delete old refresh token
        if redis_available:
            try:
                await self.redis.delete(redis_key)
            except Exception as exc:
                logger.warning("Could not revoke rotated refresh token: %s", exc)

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

        # Blacklist access token JTI. Best-effort — the client clears its own
        # tokens regardless, so a Redis outage must not turn sign-out into a
        # 500 that strands the user in a logged-in state.
        try:
            if access_token_jti:
                await self.redis.setex(
                    blacklist_redis_key(access_token_jti),
                    settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
                    "1",
                )
        except Exception as exc:
            logger.warning("Could not blacklist access token: %s", exc)

        # Delete refresh token from Redis
        if not refresh_token:
            return
        try:
            payload = decode_refresh_token(refresh_token)
            user_id: str = payload.get("sub", "")
            jti: str = payload.get("jti", "")
            await self.redis.delete(refresh_token_redis_key(user_id, jti))
        except JWTError:
            # Refresh token may already be expired — that's fine
            pass
        except Exception as exc:
            logger.warning("Could not revoke refresh token on logout: %s", exc)

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
        if self.background_tasks:
            self.background_tasks.add_task(
                send_password_reset_email,
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

        # Store refresh token in Redis. Best-effort: a Redis outage must not
        # make login itself fail. The tokens are self-contained JWTs, so the
        # user can still sign in and work; only server-side revocation and
        # refresh-rotation checks degrade until Redis returns.
        ttl_seconds = settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
        try:
            await self.redis.setex(
                refresh_token_redis_key(user_id, refresh_jti),
                ttl_seconds,
                "1",
            )
        except Exception as exc:
            logger.warning(
                "Could not persist refresh token, Redis unavailable: %s", exc
            )

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=AuthUser.model_validate(user),
        )
