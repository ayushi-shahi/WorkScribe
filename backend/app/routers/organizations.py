"""
Organization management endpoints.

Create, update, member management, invitations.
"""

from __future__ import annotations

from uuid import UUID

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_org_member, get_redis, require_role
from app.models.member import OrgMember, OrgRole
from app.models.organization import Organization
from app.models.user import User
from app.schemas.auth import InvitationAcceptRequest, InvitationInfoResponse
from app.schemas.organization import (
    InvitationResponse,
    InviteRequest,
    MemberResponse,
    MemberRoleUpdateRequest,
    MembersListResponse,
    OrganizationCreateRequest,
    OrganizationResponse,
    OrganizationUpdateRequest,
)
from app.services.organization_service import OrganizationService

router = APIRouter()


def get_org_service(
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> OrganizationService:
    """Dependency that constructs OrganizationService."""
    return OrganizationService(db=db, redis=redis)


# ---------------------------------------------------------------------------
# Create Organization
# ---------------------------------------------------------------------------

@router.post(
    "",
    response_model=OrganizationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new organization",
)
async def create_organization(
    data: OrganizationCreateRequest,
    current_user: User = Depends(get_current_user),
    service: OrganizationService = Depends(get_org_service),
) -> OrganizationResponse:
    """
    Create a new organization.

    - Slug must be globally unique (3-30 chars, lowercase alphanumeric + hyphens)
    - Creator is automatically assigned Owner role
    """
    return await service.create_organization(data, current_user)


# ---------------------------------------------------------------------------
# Get Organization
# ---------------------------------------------------------------------------

@router.get(
    "/{slug}",
    response_model=OrganizationResponse,
    summary="Get organization by slug",
)
async def get_organization(
    org_and_member: tuple[Organization, OrgMember] = Depends(get_org_member),
    service: OrganizationService = Depends(get_org_service),
) -> OrganizationResponse:
    """Get organization details. Must be a member."""
    org, _ = org_and_member
    return await service.get_organization(org.slug)


# ---------------------------------------------------------------------------
# Update Organization
# ---------------------------------------------------------------------------

@router.patch(
    "/{slug}",
    response_model=OrganizationResponse,
    summary="Update organization name or slug",
)
async def update_organization(
    data: OrganizationUpdateRequest,
    org_and_member: tuple[Organization, OrgMember] = Depends(
        require_role(OrgRole.owner, OrgRole.admin)
    ),
    service: OrganizationService = Depends(get_org_service),
) -> OrganizationResponse:
    """Update organization name and/or slug. Requires Owner or Admin role."""
    org, _ = org_and_member
    return await service.update_organization(org, data)


# ---------------------------------------------------------------------------
# List Members
# ---------------------------------------------------------------------------

@router.get(
    "/{slug}/members",
    response_model=MembersListResponse,
    summary="List organization members",
)
async def list_members(
    org_and_member: tuple[Organization, OrgMember] = Depends(get_org_member),
    service: OrganizationService = Depends(get_org_service),
) -> MembersListResponse:
    """List all members of the organization."""
    org, _ = org_and_member
    return await service.list_members(org.id)


# ---------------------------------------------------------------------------
# Invite Member
# ---------------------------------------------------------------------------

@router.post(
    "/{slug}/invite",
    response_model=InvitationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Invite a new member",
)
async def invite_member(
    data: InviteRequest,
    org_and_member: tuple[Organization, OrgMember] = Depends(
        require_role(OrgRole.owner, OrgRole.admin)
    ),
    current_user: User = Depends(get_current_user),
    service: OrganizationService = Depends(get_org_service),
) -> InvitationResponse:
    """
    Invite a user to the organization by email.

    - Requires Owner or Admin role
    - Sends invitation email via Celery
    - Token expires in 48 hours
    """
    org, _ = org_and_member
    return await service.invite_member(org, data, current_user)


# ---------------------------------------------------------------------------
# Revoke Invitation
# ---------------------------------------------------------------------------

@router.delete(
    "/{slug}/invitations/{invitation_id}",
    status_code=status.HTTP_200_OK,
    summary="Revoke a pending invitation",
)
async def revoke_invitation(
    invitation_id: UUID,
    org_and_member: tuple[Organization, OrgMember] = Depends(
        require_role(OrgRole.owner, OrgRole.admin)
    ),
    service: OrganizationService = Depends(get_org_service),
) -> dict:
    """Revoke a pending invitation. Requires Owner or Admin role."""
    org, _ = org_and_member
    await service.revoke_invitation(org.id, invitation_id)
    return {}


# ---------------------------------------------------------------------------
# Accept Invitation
# ---------------------------------------------------------------------------

@router.post(
    "/invitations/{token}/accept",
    response_model=OrganizationResponse,
    summary="Accept an invitation",
)
async def accept_invitation(
    token: str,
    current_user: User = Depends(get_current_user),
    service: OrganizationService = Depends(get_org_service),
) -> OrganizationResponse:
    """
    Accept an organization invitation.

    - User must be logged in with the same email the invitation was sent to
    - Token must not be expired or already used
    """
    return await service.accept_invitation(token, current_user)


# ---------------------------------------------------------------------------
# Update Member Role
# ---------------------------------------------------------------------------

@router.patch(
    "/{slug}/members/{user_id}",
    response_model=MemberResponse,
    summary="Update a member's role",
)
async def update_member_role(
    user_id: UUID,
    data: MemberRoleUpdateRequest,
    org_and_member: tuple[Organization, OrgMember] = Depends(
        require_role(OrgRole.owner, OrgRole.admin)
    ),
    service: OrganizationService = Depends(get_org_service),
) -> MemberResponse:
    """
    Change a member's role.

    - Owner can change any role
    - Admin can only assign admin or member (not owner)
    - Cannot change the owner's role
    """
    org, acting_member = org_and_member
    return await service.update_member_role(org.id, user_id, data.role, acting_member)


# ---------------------------------------------------------------------------
# Remove Member
# ---------------------------------------------------------------------------

@router.delete(
    "/{slug}/members/{user_id}",
    status_code=status.HTTP_200_OK,
    summary="Remove a member from the organization",
)
async def remove_member(
    user_id: UUID,
    org_and_member: tuple[Organization, OrgMember] = Depends(
        require_role(OrgRole.owner, OrgRole.admin)
    ),
    service: OrganizationService = Depends(get_org_service),
) -> dict:
    """
    Remove a member from the organization.

    - Cannot remove the owner
    - Admin cannot remove other admins
    """
    org, acting_member = org_and_member
    await service.remove_member(org.id, user_id, acting_member)
    return {}