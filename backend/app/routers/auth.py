"""
Authentication endpoints.

Register, login, logout, token refresh, password reset, OAuth, me.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

import redis.asyncio as aioredis

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_redis
from app.core.security import decode_access_token
from app.models.user import User
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    LogoutRequest,
    MeResponse,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
)
from app.services.auth_service import AuthService

router = APIRouter()


def get_auth_service(
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> AuthService:
    """Dependency that constructs AuthService."""
    return AuthService(db=db, redis=redis)


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------

@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
)
async def register(
    data: RegisterRequest,
    service: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    """
    Create a new user account.

    - Email must be globally unique
    - Password must be min 8 chars and contain at least 1 number
    - Returns JWT access + refresh tokens on success
    """
    return await service.register(data)


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login with email and password",
)
async def login(
    data: LoginRequest,
    service: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    """
    Authenticate with email and password.

    Returns JWT access + refresh tokens.
    """
    return await service.login(data)


# ---------------------------------------------------------------------------
# Refresh
# ---------------------------------------------------------------------------

@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh access token",
)
async def refresh(
    data: RefreshRequest,
    service: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    """
    Exchange a valid refresh token for a new access + refresh token pair.

    Refresh tokens are rotated on every use.
    """
    return await service.refresh(data.refresh_token)


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------

@router.post(
    "/logout",
    status_code=status.HTTP_200_OK,
    summary="Logout and revoke tokens",
)
async def logout(
    data: LogoutRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
) -> None:
    """
    Logout the current user.

    - Blacklists the current access token JTI in Redis
    - Deletes the refresh token from Redis
    """
    auth_header = request.headers.get("Authorization", "")
    access_token = auth_header.replace("Bearer ", "")

    try:
        payload = decode_access_token(access_token)
        jti: str = payload.get("jti", "")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_TOKEN", "message": "Could not decode access token"},
        )

    await service.logout(
        access_token_jti=jti,
        refresh_token=data.refresh_token,
    )


# ---------------------------------------------------------------------------
# Forgot Password
# ---------------------------------------------------------------------------

@router.post(
    "/forgot-password",
    status_code=status.HTTP_200_OK,
    summary="Request a password reset email",
)
async def forgot_password(
    data: ForgotPasswordRequest,
    service: AuthService = Depends(get_auth_service),
) -> None:
    """
    Initiate password reset flow.

    Always returns 204 regardless of whether the email exists
    to prevent user enumeration.
    """
    await service.forgot_password(data.email)


# ---------------------------------------------------------------------------
# Reset Password
# ---------------------------------------------------------------------------

@router.post(
    "/reset-password",
    status_code=status.HTTP_200_OK,
    summary="Reset password using token",
)
async def reset_password(
    data: ResetPasswordRequest,
    service: AuthService = Depends(get_auth_service),
) -> None:
    """
    Complete password reset using the token sent via email.

    Token is single-use and expires after 1 hour.
    """
    await service.reset_password(data.token, data.new_password)


# ---------------------------------------------------------------------------
# Me
# ---------------------------------------------------------------------------

@router.get(
    "/me",
    response_model=MeResponse,
    summary="Get current user profile",
)
async def get_me(
    current_user: User = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
) -> MeResponse:
    """
    Return the currently authenticated user's profile.
    """
    return await service.get_me(current_user)