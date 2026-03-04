"""
OAuth service.

Handles Google ID token verification and get-or-create user logic with
account linking (existing email/password account → linked Google identity).
"""

from __future__ import annotations

import logging
from typing import Any

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token, refresh_token_redis_key
from app.models.user import User
from app.schemas.auth import TokenResponse

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Google token verification
# ---------------------------------------------------------------------------


def verify_google_id_token(token: str) -> dict[str, Any]:
    """
    Verify a Google ID token using Google's public keys.

    Args:
        token: The ID token string received from the frontend.

    Returns:
        The decoded token payload (dict with sub, email, name, picture, etc.)

    Raises:
        ValueError: If the token is invalid, expired, or audience mismatch.
    """
    try:
        payload = google_id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
    except Exception as exc:
        logger.warning("Google ID token verification failed: %s", exc)
        raise ValueError(f"Invalid Google ID token: {exc}") from exc

    # Verify the token was issued for our app
    if payload.get("aud") != settings.GOOGLE_CLIENT_ID:
        raise ValueError("Token audience mismatch")

    # Email must be present and verified by Google
    if not payload.get("email"):
        raise ValueError("Google token missing email claim")

    if not payload.get("email_verified", False):
        raise ValueError("Google account email is not verified")

    return payload


# ---------------------------------------------------------------------------
# Get or create user
# ---------------------------------------------------------------------------


async def get_or_create_google_user(
    db: AsyncSession,
    payload: dict[str, Any],
) -> tuple[User, bool]:
    """
    Find or create a user from a verified Google token payload.

    Strategy:
    1. Look up by (oauth_provider='google', oauth_id=sub) → returning user
    2. Look up by email → existing password account → link Google identity
    3. Neither found → create new user with Google identity

    Args:
        db: Async database session.
        payload: Verified Google token payload.

    Returns:
        Tuple of (user, is_new_user).
    """
    google_sub: str = payload["sub"]
    email: str = payload["email"]
    display_name: str = payload.get("name") or email.split("@")[0]
    avatar_url: str | None = payload.get("picture")

    # --- 1. Existing Google-linked account ---
    result = await db.execute(
        select(User).where(
            User.oauth_provider == "google",
            User.oauth_id == google_sub,
        )
    )
    user = result.scalar_one_or_none()

    if user is not None:
        # Refresh avatar in case it changed
        if avatar_url and user.avatar_url != avatar_url:
            user.avatar_url = avatar_url
            await db.flush()
        return user, False

    # --- 2. Existing email/password account → link Google identity ---
    result = await db.execute(
        select(User).where(User.email == email)
    )
    user = result.scalar_one_or_none()

    if user is not None:
        # Link Google identity to existing account
        user.oauth_provider = "google"
        user.oauth_id = google_sub
        user.email_verified = True
        if avatar_url and not user.avatar_url:
            user.avatar_url = avatar_url
        await db.flush()
        logger.info("Linked Google identity to existing account: %s", email)
        return user, False

    # --- 3. Brand new user ---
    user = User(
        email=email,
        password_hash=None,  # OAuth users have no password
        display_name=display_name,
        avatar_url=avatar_url,
        is_active=True,
        oauth_provider="google",
        oauth_id=google_sub,
        email_verified=True,
    )
    db.add(user)
    await db.flush()  # populate user.id before returning
    logger.info("Created new user via Google OAuth: %s", email)
    return user, True


# ---------------------------------------------------------------------------
# Build token response
# ---------------------------------------------------------------------------


async def build_token_response(user: User, redis: Any) -> TokenResponse:
    """
    Issue a JWT access token + refresh token for an OAuth-authenticated user.

    Reuses the same token infrastructure as email/password login so the
    frontend receives an identical TokenResponse shape.

    Args:
        user: The authenticated User ORM instance.
        redis: Redis client (for storing refresh token).

    Returns:
        TokenResponse with access_token, refresh_token, token_type, expires_in.
    """
    access_token = create_access_token(user_id=str(user.id))
    refresh_token, refresh_jti = create_refresh_token(user_id=str(user.id))

    # Store refresh token in Redis: refresh:{user_id}:{jti}
    ttl_seconds = settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    await redis.setex(
        refresh_token_redis_key(str(user.id), refresh_jti),
        ttl_seconds,
        "valid",
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
