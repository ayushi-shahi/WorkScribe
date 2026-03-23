"""
Authentication endpoints.

Register, login, logout, token refresh, password reset, OAuth, me.
"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
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
from app.models.invitation import Invitation
from app.models.user import User as UserModel
from datetime import UTC, datetime
from sqlalchemy import select
from pydantic import BaseModel
from pydantic import BaseModel as PydanticBase

router = APIRouter()


def get_auth_service(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> AuthService:
    return AuthService(db=db, redis=redis, background_tasks=background_tasks)


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
class AcceptInviteRequest(PydanticBase):
    display_name: str | None = None
    password: str | None = None

@router.post(
    "/invitations/{token}/accept",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Accept an organization invitation",
)
async def accept_invitation(
    token: str,
    data: AcceptInviteRequest = AcceptInviteRequest(),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    service: OrganizationService = Depends(get_org_service),
) -> TokenResponse:
    from app.models.invitation import Invitation as Inv
    from app.models.user import User as U
    from app.core.security import hash_password

    # Get invitation
    inv_result = await db.execute(select(Inv).where(Inv.token == token))
    invitation = inv_result.scalar_one_or_none()
    if invitation is None:
        raise HTTPException(status_code=404, detail={"code": "INVITE_NOT_FOUND", "message": "Invitation not found"})

    email = invitation.email

    # Check if user exists, if not register them
    user_result = await db.execute(select(U).where(U.email == email))
    user = user_result.scalar_one_or_none()

    if user is None:
        if not data.display_name or not data.password:
            raise HTTPException(status_code=400, detail={"code": "REGISTRATION_REQUIRED", "message": "display_name and password required for new users"})
        user = U(
            email=email,
            display_name=data.display_name,
            password_hash=hash_password(data.password),
            is_active=True,
            email_verified=True,
        )
        db.add(user)
        await db.flush()

    # Accept invitation
    await service.accept_invitation_by_token(token)

    return await build_token_response(user=user, redis=redis)
# ---------------------------------------------------------------------------
# Get Invitation Details — no auth required
# ---------------------------------------------------------------------------



class InviteDetailsResponse(BaseModel):
    org_name: str
    org_slug: str
    role: str
    email: str
    inviter_name: str

@router.get(
    "/invitations/{token}",
    response_model=InviteDetailsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get invitation details by token",
)
async def get_invitation_details(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> InviteDetailsResponse:
    from app.models.organization import Organization
    from app.models.user import User as U

    result = await db.execute(
        select(Invitation).where(Invitation.token == token)
    )
    invitation = result.scalar_one_or_none()

    if invitation is None or invitation.accepted_at is not None:
        raise HTTPException(status_code=404, detail={"code": "INVITE_NOT_FOUND", "message": "Invitation not found"})

    if invitation.expires_at < datetime.now(UTC):
        raise HTTPException(status_code=410, detail={"code": "INVITE_EXPIRED", "message": "Invitation has expired"})

    org_result = await db.execute(select(Organization).where(Organization.id == invitation.org_id))
    org = org_result.scalar_one()

    inviter_result = await db.execute(select(U).where(U.id == invitation.created_by))
    inviter = inviter_result.scalar_one_or_none()

    return InviteDetailsResponse(
        org_name=org.name,
        org_slug=org.slug,
        role=invitation.role.value,
        email=invitation.email,
        inviter_name=inviter.display_name if inviter else "Someone",
    )
    
# ---------------------------------------------------------------------------
# Get user's orgs (for post-login redirect)
# ---------------------------------------------------------------------------

@router.get(
    "/orgs",
    summary="List orgs the current user belongs to",
)
async def get_user_orgs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    from app.models.member import OrgMember
    from app.models.organization import Organization

    result = await db.execute(
        select(Organization)
        .join(OrgMember, OrgMember.org_id == Organization.id)
        .where(OrgMember.user_id == current_user.id)
    )
    orgs = result.scalars().all()
    return [{"id": str(o.id), "name": o.name, "slug": o.slug} for o in orgs]