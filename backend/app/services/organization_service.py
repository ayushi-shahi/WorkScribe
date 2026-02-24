"""
Organization business logic.

Handles org creation, member management, invitations.
All queries scoped by org_id.
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

import redis.asyncio as aioredis
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.invitation import Invitation
from app.models.member import OrgMember, OrgRole
from app.models.organization import Organization
from app.models.user import User
from app.schemas.organization import (
    InvitationResponse,
    InviteRequest,
    MemberResponse,
    MembersListResponse,
    OrganizationCreateRequest,
    OrganizationResponse,
    OrganizationUpdateRequest,
)


class OrganizationService:
    """Handles all organization operations."""

    def __init__(self, db: AsyncSession, redis: aioredis.Redis) -> None:
        self.db = db
        self.redis = redis

    # -----------------------------------------------------------------------
    # Create Organization
    # -----------------------------------------------------------------------

    async def create_organization(
        self, data: OrganizationCreateRequest, owner: User
    ) -> OrganizationResponse:
        """
        Create a new organization.

        - Validates slug uniqueness
        - Creates organization record
        - Assigns creator as Owner
        - Returns OrganizationResponse
        """
        # Check slug uniqueness
        existing = await self.db.execute(
            select(Organization).where(Organization.slug == data.slug)
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "SLUG_TAKEN", "message": "Organization slug is already taken"},
            )

        # Create organization
        org = Organization(name=data.name, slug=data.slug)
        self.db.add(org)
        await self.db.flush()

        # Add creator as Owner
        member = OrgMember(
            org_id=org.id,
            user_id=owner.id,
            role=OrgRole.owner,
        )
        self.db.add(member)
        await self.db.flush()

        return OrganizationResponse.model_validate(org)

    # -----------------------------------------------------------------------
    # Get Organization
    # -----------------------------------------------------------------------

    async def get_organization(self, slug: str) -> OrganizationResponse:
        """Get organization by slug."""
        result = await self.db.execute(
            select(Organization).where(Organization.slug == slug)
        )
        org = result.scalar_one_or_none()

        if org is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "ORG_NOT_FOUND", "message": "Organization not found"},
            )

        return OrganizationResponse.model_validate(org)

    # -----------------------------------------------------------------------
    # Update Organization
    # -----------------------------------------------------------------------

    async def update_organization(
        self, org: Organization, data: OrganizationUpdateRequest
    ) -> OrganizationResponse:
        
        if data.slug is not None and data.slug != org.slug:
            existing = await self.db.execute(
                select(Organization).where(Organization.slug == data.slug)
            )
            if existing.scalar_one_or_none() is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={"code": "SLUG_TAKEN", "message": "Organization slug is already taken"},
                )
            org.slug = data.slug

        if data.name is not None:
            org.name = data.name

        await self.db.flush()
        await self.db.refresh(org)
        return OrganizationResponse.model_validate(org)

    # -----------------------------------------------------------------------
    # List Members
    # -----------------------------------------------------------------------

    async def list_members(self, org_id: UUID) -> MembersListResponse:
        """List all members of an organization with user details."""
        result = await self.db.execute(
            select(OrgMember, User)
            .join(User, OrgMember.user_id == User.id)
            .where(OrgMember.org_id == org_id)
            .order_by(OrgMember.joined_at)
        )
        rows = result.all()

        members = [
            MemberResponse(
                id=member.id,
                user_id=member.user_id,
                email=user.email,
                display_name=user.display_name,
                avatar_url=user.avatar_url,
                role=member.role.value,
                joined_at=member.joined_at,
            )
            for member, user in rows
        ]

        return MembersListResponse(members=members, total=len(members))

    # -----------------------------------------------------------------------
    # Invite Member
    # -----------------------------------------------------------------------

    async def invite_member(
        self, org: Organization, data: InviteRequest, inviter: User
    ) -> InvitationResponse:
        """
        Create an invitation for a new member.

        - Checks if user is already a member
        - Creates invitation record with secure token
        - Queues invitation email via Celery
        """
        # Check if email already has a pending invitation
        existing_invite = await self.db.execute(
            select(Invitation).where(
                Invitation.org_id == org.id,
                Invitation.email == data.email.lower(),
                Invitation.accepted_at.is_(None),
                Invitation.expires_at > datetime.now(UTC),
            )
        )
        if existing_invite.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "INVITE_EXISTS", "message": "A pending invitation already exists for this email"},
            )

        # Check if user is already a member
        existing_user = await self.db.execute(
            select(User).where(User.email == data.email.lower())
        )
        user = existing_user.scalar_one_or_none()

        if user is not None:
            existing_member = await self.db.execute(
                select(OrgMember).where(
                    OrgMember.org_id == org.id,
                    OrgMember.user_id == user.id,
                )
            )
            if existing_member.scalar_one_or_none() is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={"code": "ALREADY_MEMBER", "message": "User is already a member of this organization"},
                )

        # Create invitation
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(UTC) + timedelta(hours=48)

        invitation = Invitation(
            org_id=org.id,
            email=data.email.lower(),
            role=OrgRole(data.role),
            token=token,
            expires_at=expires_at,
            created_by=inviter.id,
            created_at=datetime.now(UTC),
        )
        self.db.add(invitation)
        await self.db.flush()

        # Queue invitation email
        from app.workers.email_tasks import send_invitation_email
        send_invitation_email.delay(
            to_email=data.email.lower(),
            org_name=org.name,
            org_slug=org.slug,
            inviter_name=inviter.display_name,
            role=data.role,
            invitation_token=token,
            frontend_url=settings.FRONTEND_URL,
        )

        return InvitationResponse(
            id=invitation.id,
            org_id=invitation.org_id,
            email=invitation.email,
            role=invitation.role.value,
            expires_at=invitation.expires_at,
            created_at=invitation.created_at,
            is_expired=False,
        )

    # -----------------------------------------------------------------------
    # Accept Invitation
    # -----------------------------------------------------------------------

    async def accept_invitation(
        self, token: str, current_user: User
    ) -> OrganizationResponse:
        """
        Accept an invitation.

        - Validates token exists and is not expired
        - Verifies user email matches invitation email
        - Adds user as org member
        - Marks invitation as accepted
        """
        result = await self.db.execute(
            select(Invitation).where(Invitation.token == token)
        )
        invitation = result.scalar_one_or_none()

        if invitation is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "INVITE_NOT_FOUND", "message": "Invitation not found"},
            )

        if invitation.accepted_at is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "INVITE_USED", "message": "Invitation has already been accepted"},
            )

        if invitation.expires_at < datetime.now(UTC):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "INVITE_EXPIRED", "message": "Invitation has expired"},
            )

        if invitation.email != current_user.email:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "EMAIL_MISMATCH", "message": "Invitation was sent to a different email address"},
            )

        # Check not already a member
        existing_member = await self.db.execute(
            select(OrgMember).where(
                OrgMember.org_id == invitation.org_id,
                OrgMember.user_id == current_user.id,
            )
        )
        if existing_member.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "ALREADY_MEMBER", "message": "You are already a member of this organization"},
            )

        # Add member
        member = OrgMember(
            org_id=invitation.org_id,
            user_id=current_user.id,
            role=invitation.role,
        )
        self.db.add(member)

        # Mark invitation accepted
        invitation.accepted_at = datetime.now(UTC)
        await self.db.flush()

        # Return org
        org_result = await self.db.execute(
            select(Organization).where(Organization.id == invitation.org_id)
        )
        org = org_result.scalar_one()
        return OrganizationResponse.model_validate(org)

    # -----------------------------------------------------------------------
    # Revoke Invitation
    # -----------------------------------------------------------------------

    async def revoke_invitation(
        self, org_id: UUID, invitation_id: UUID
    ) -> None:
        """Delete a pending invitation."""
        result = await self.db.execute(
            select(Invitation).where(
                Invitation.id == invitation_id,
                Invitation.org_id == org_id,
            )
        )
        invitation = result.scalar_one_or_none()

        if invitation is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "INVITE_NOT_FOUND", "message": "Invitation not found"},
            )

        await self.db.delete(invitation)
        await self.db.flush()

    # -----------------------------------------------------------------------
    # Update Member Role
    # -----------------------------------------------------------------------

    async def update_member_role(
        self,
        org_id: UUID,
        target_user_id: UUID,
        new_role: str,
        acting_member: OrgMember,
    ) -> MemberResponse:
        """
        Change a member's role.

        - Owner can change any role
        - Admin can only set members to admin or member (not owner)
        - Cannot change the owner's role
        """
        result = await self.db.execute(
            select(OrgMember, User)
            .join(User, OrgMember.user_id == User.id)
            .where(
                OrgMember.org_id == org_id,
                OrgMember.user_id == target_user_id,
            )
        )
        row = result.one_or_none()

        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "MEMBER_NOT_FOUND", "message": "Member not found"},
            )

        target_member, target_user = row

        # Cannot change owner's role
        if target_member.role == OrgRole.owner:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "CANNOT_CHANGE_OWNER", "message": "Cannot change the owner's role"},
            )

        # Admin cannot assign owner role
        if acting_member.role == OrgRole.admin and new_role == "owner":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "INSUFFICIENT_ROLE", "message": "Admins cannot assign owner role"},
            )

        target_member.role = OrgRole(new_role)
        await self.db.flush()

        return MemberResponse(
            id=target_member.id,
            user_id=target_member.user_id,
            email=target_user.email,
            display_name=target_user.display_name,
            avatar_url=target_user.avatar_url,
            role=target_member.role.value,
            joined_at=target_member.joined_at,
        )

    # -----------------------------------------------------------------------
    # Remove Member
    # -----------------------------------------------------------------------

    async def remove_member(
        self,
        org_id: UUID,
        target_user_id: UUID,
        acting_member: OrgMember,
    ) -> None:
        """
        Remove a member from the organization.

        - Cannot remove the owner
        - Admin cannot remove other admins
        """
        result = await self.db.execute(
            select(OrgMember).where(
                OrgMember.org_id == org_id,
                OrgMember.user_id == target_user_id,
            )
        )
        target_member = result.scalar_one_or_none()

        if target_member is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "MEMBER_NOT_FOUND", "message": "Member not found"},
            )

        if target_member.role == OrgRole.owner:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "CANNOT_REMOVE_OWNER", "message": "Cannot remove the organization owner"},
            )

        if acting_member.role == OrgRole.admin and target_member.role == OrgRole.admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "INSUFFICIENT_ROLE", "message": "Admins cannot remove other admins"},
            )

        await self.db.delete(target_member)
        await self.db.flush()