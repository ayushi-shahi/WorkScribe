"""
Organization schemas.

Request/response models for organization and member management endpoints.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Organization
# ---------------------------------------------------------------------------

class OrganizationCreateRequest(BaseModel):
    """Request body for POST /organizations."""

    name: str = Field(min_length=2, max_length=100)
    slug: str = Field(min_length=3, max_length=30)

    @field_validator("slug")
    @classmethod
    def slug_must_be_valid(cls, v: str) -> str:
        import re
        if not re.match(r"^[a-z0-9][a-z0-9-]*[a-z0-9]$", v):
            raise ValueError(
                "Slug must be lowercase alphanumeric and hyphens only, "
                "and cannot start or end with a hyphen"
            )
        return v


class OrganizationUpdateRequest(BaseModel):
    """Request body for PATCH /organizations/{slug}."""

    name: str | None = Field(default=None, min_length=2, max_length=100)
    slug: str | None = Field(default=None, min_length=3, max_length=30)

    @field_validator("slug")
    @classmethod
    def slug_must_be_valid(cls, v: str | None) -> str | None:
        if v is None:
            return v
        import re
        if not re.match(r"^[a-z0-9][a-z0-9-]*[a-z0-9]$", v):
            raise ValueError(
                "Slug must be lowercase alphanumeric and hyphens only, "
                "and cannot start or end with a hyphen"
            )
        return v


class OrganizationResponse(BaseModel):
    """Organization detail response."""

    id: UUID
    name: str
    slug: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Members
# ---------------------------------------------------------------------------

class MemberResponse(BaseModel):
    """Single org member with user info and role."""

    id: UUID
    user_id: UUID
    email: str
    display_name: str
    avatar_url: str | None
    role: str
    joined_at: datetime

    model_config = {"from_attributes": True}


class MemberRoleUpdateRequest(BaseModel):
    """Request body for PATCH /organizations/{slug}/members/{user_id}."""

    role: str = Field(pattern="^(admin|member)$")


# ---------------------------------------------------------------------------
# Invitations
# ---------------------------------------------------------------------------

class InviteRequest(BaseModel):
    """Request body for POST /organizations/{slug}/invite."""

    email: str = Field(min_length=1, max_length=255)
    role: str = Field(pattern="^(admin|member)$")


class InvitationResponse(BaseModel):
    """Invitation detail response."""

    id: UUID
    org_id: UUID
    email: str
    role: str
    token: str  # Required by test: data["token"]
    expires_at: datetime
    created_at: datetime
    is_expired: bool

    model_config = {"from_attributes": True}


class MembersListResponse(BaseModel):
    """Response for GET /organizations/{slug}/members."""

    members: list[MemberResponse]
    total: int


class InvitationsListResponse(BaseModel):
    """Response for listing pending invitations."""

    invitations: list[InvitationResponse]
    total: int