"""
Security utilities.

Password hashing, JWT token creation/validation, OAuth helpers.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt as _bcrypt
from jose import JWTError, jwt

from app.core.config import settings


# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt (cost=12)."""
    password_bytes = password.encode("utf-8")[:72]
    salt = _bcrypt.gensalt(rounds=12)
    return _bcrypt.hashpw(password_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    password_bytes = plain_password.encode("utf-8")[:72]
    return _bcrypt.checkpw(password_bytes, hashed_password.encode("utf-8"))


# ---------------------------------------------------------------------------
# JWT tokens
# ---------------------------------------------------------------------------

def create_access_token(user_id: str, jti: str | None = None) -> str:
    """
    Create a short-lived JWT access token.

    Args:
        user_id: The user's UUID as string.
        jti: Optional JWT ID. Generated if not provided.

    Returns:
        Signed JWT string.
    """
    now = datetime.now(UTC)
    expire = now + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    payload: dict[str, Any] = {
        "sub": user_id,
        "jti": jti or str(uuid.uuid4()),
        "type": "access",
        "iat": now,
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> tuple[str, str]:
    """
    Create a long-lived JWT refresh token.

    Args:
        user_id: The user's UUID as string.

    Returns:
        Tuple of (encoded_token, jti) so jti can be stored in Redis.
    """
    now = datetime.now(UTC)
    expire = now + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
    jti = str(uuid.uuid4())
    payload: dict[str, Any] = {
        "sub": user_id,
        "jti": jti,
        "type": "refresh",
        "iat": now,
        "exp": expire,
    }
    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token, jti


def decode_token(token: str) -> dict[str, Any]:
    """
    Decode and validate a JWT token.

    Args:
        token: Encoded JWT string.

    Returns:
        Decoded payload dict.

    Raises:
        JWTError: If the token is invalid, expired, or tampered.
    """
    return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])


def decode_access_token(token: str) -> dict[str, Any]:
    """
    Decode and validate a JWT access token.

    Raises:
        JWTError: If invalid or wrong type.
    """
    payload = decode_token(token)
    if payload.get("type") != "access":
        raise JWTError("Not an access token")
    return payload


def decode_refresh_token(token: str) -> dict[str, Any]:
    """
    Decode and validate a JWT refresh token.

    Raises:
        JWTError: If invalid or wrong type.
    """
    payload = decode_token(token)
    if payload.get("type") != "refresh":
        raise JWTError("Not a refresh token")
    return payload


# ---------------------------------------------------------------------------
# Redis key helpers
# ---------------------------------------------------------------------------

def refresh_token_redis_key(user_id: str, jti: str) -> str:
    """Redis key for storing a refresh token. Format: refresh:{user_id}:{jti}"""
    return f"refresh:{user_id}:{jti}"


def blacklist_redis_key(jti: str) -> str:
    """Redis key for a blacklisted access token JTI. Format: blacklist:{jti}"""
    return f"blacklist:{jti}"


def password_reset_redis_key(token: str) -> str:
    """Redis key for a password reset token. Format: pwd_reset:{token}"""
    return f"pwd_reset:{token}"


# ---------------------------------------------------------------------------
# Password reset token
# ---------------------------------------------------------------------------

def create_password_reset_token() -> str:
    """Generate a secure random password reset token."""
    return str(uuid.uuid4())

