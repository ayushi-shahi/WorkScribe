"""
OrgMember ORM model.
"""

from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, Enum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.user import User


class OrgRole(str, enum.Enum):
    """Organization member role enumeration."""

    owner = "owner"
    admin = "admin"
    member = "member"


class OrgMember(Base, UUIDMixin):
    """Join table linking users to organizations with a role."""

    __tablename__ = "org_members"

    org_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[OrgRole] = mapped_column(
        Enum(OrgRole, name="org_role", create_type=False), nullable=False
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    organization: Mapped[Organization] = relationship(
        "Organization", back_populates="members"
    )
    user: Mapped[User] = relationship(
        "User", back_populates="org_memberships"
    )

    def __repr__(self) -> str:
        return f"<OrgMember org_id={self.org_id} user_id={self.user_id} role={self.role}>"