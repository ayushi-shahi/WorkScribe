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
    OAuthGoogleRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
)
from app.schemas.organization import OrganizationResponse
from app.services.auth_service import AuthService
from app.services.oauth_service import (
    build_token_response,
    get_or_create_google_user,
    verify_google_id_token,
)
from app.services.organization_service import OrganizationService

router = APIRouter()


def get_auth_service(
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> AuthService:
    """Dependency that constructs AuthService."""
    return AuthService(db=db, redis=redis)


def get_org_service(
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> OrganizationService:
    """Dependency that constructs OrganizationService."""
    return OrganizationService(db=db, redis=redis)


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
    return await service.get_me(current_user)


# ---------------------------------------------------------------------------
# Google OAuth
# ---------------------------------------------------------------------------

@router.post(
    "/oauth/google",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Sign in or register with Google ID token",
)
async def oauth_google(
    data: OAuthGoogleRequest,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> TokenResponse:
    """
    Authenticate using a Google ID token obtained from the frontend OAuth flow.

    Flow:
    1. Frontend obtains a Google ID token via @react-oauth/google
    2. Frontend POSTs the id_token to this endpoint
    3. Backend verifies the token with Google's public keys
    4. Backend finds or creates a user (with account linking if email exists)
    5. Backend returns a standard TokenResponse (same shape as /login)

    Error codes:
    - GOOGLE_AUTH_NOT_CONFIGURED: GOOGLE_CLIENT_ID env var not set
    - INVALID_GOOGLE_TOKEN: Token failed verification
    - ACCOUNT_INACTIVE: User account is deactivated
    """
    # Guard: GOOGLE_CLIENT_ID must be configured
    from app.core.config import settings
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "GOOGLE_AUTH_NOT_CONFIGURED",
                "message": "Google OAuth is not configured on this server",
            },
        )

    # Verify the Google ID token
    try:
        payload = verify_google_id_token(data.id_token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "INVALID_GOOGLE_TOKEN",
                "message": str(exc),
            },
        )

    # Get or create user (with account linking)
    user, _is_new = await get_or_create_google_user(db=db, payload=payload)

    # Guard: account must be active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "ACCOUNT_INACTIVE",
                "message": "This account has been deactivated",
            },
        )

    # Issue JWT tokens (identical shape to /login response)
    return await build_token_response(user=user, redis=redis)


# ---------------------------------------------------------------------------
# Accept Invitation — no auth required, token is the credential
# ---------------------------------------------------------------------------

@router.post(
    "/invitations/{token}/accept",
    response_model=OrganizationResponse,
    status_code=status.HTTP_200_OK,
    summary="Accept an organization invitation",
)
async def accept_invitation(
    token: str,
    service: OrganizationService = Depends(get_org_service),
) -> OrganizationResponse:
    """
    Accept an organization invitation by token.

    No Authorization header required. The invitation token is the credential.
    The invited user must already be registered with the same email.
    """
    return await service.accept_invitation_by_token(token)