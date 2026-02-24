"""
Authentication schemas.

Request/response models for all auth endpoints including OAuth.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    """Request body for POST /auth/register."""

    display_name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def password_must_contain_number(cls, v: str) -> str:
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one number")
        return v


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    """Request body for POST /auth/login."""

    email: EmailStr
    password: str = Field(min_length=1)


class TokenResponse(BaseModel):
    """Response for login and token refresh."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Access token TTL in seconds")


# ---------------------------------------------------------------------------
# Refresh
# ---------------------------------------------------------------------------

class RefreshRequest(BaseModel):
    """Request body for POST /auth/refresh."""

    refresh_token: str


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------

class LogoutRequest(BaseModel):
    """Request body for POST /auth/logout."""

    refresh_token: str


# ---------------------------------------------------------------------------
# Password Reset
# ---------------------------------------------------------------------------

class ForgotPasswordRequest(BaseModel):
    """Request body for POST /auth/forgot-password."""

    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Request body for POST /auth/reset-password."""

    token: str
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def password_must_contain_number(cls, v: str) -> str:
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one number")
        return v


# ---------------------------------------------------------------------------
# OAuth
# ---------------------------------------------------------------------------

class OAuthGoogleRequest(BaseModel):
    """Request body for POST /auth/oauth/google (frontend sends ID token)."""

    id_token: str = Field(description="Google ID token from frontend OAuth flow")


class OAuthCallbackResponse(BaseModel):
    """Response after successful OAuth authentication."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    is_new_user: bool = Field(description="True if this is a newly created account")


# ---------------------------------------------------------------------------
# User (response object embedded in other responses)
# ---------------------------------------------------------------------------

class UserResponse(BaseModel):
    """Public user representation returned in API responses."""

    id: UUID
    email: str
    display_name: str
    avatar_url: str | None
    email_verified: bool
    oauth_provider: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class MeResponse(BaseModel):
    """Response for GET /auth/me — current user with org memberships."""

    id: UUID
    email: str
    display_name: str
    avatar_url: str | None
    email_verified: bool
    oauth_provider: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Invitation Accept
# ---------------------------------------------------------------------------

class InvitationAcceptRequest(BaseModel):
    """Request body for POST /auth/invitations/{token}/accept."""

    # If user is not yet registered, they must provide password
    display_name: str | None = Field(default=None, min_length=2, max_length=100)
    password: str | None = Field(default=None, min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def password_must_contain_number(cls, v: str | None) -> str | None:
        if v is not None and not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one number")
        return v


class InvitationInfoResponse(BaseModel):
    """Public info about an invitation (shown before accepting)."""

    email: str
    org_name: str
    org_slug: str
    role: str
    expires_at: datetime
    is_expired: bool