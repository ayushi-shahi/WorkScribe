"""
Organization ORM model.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.invitation import Invitation
    from app.models.member import OrgMember
    from app.models.project import Project


class Organization(Base, UUIDMixin, TimestampMixin):
    """Represents a tenant organization."""

    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)

    # Relationships
    members: Mapped[list[OrgMember]] = relationship(
        "OrgMember", back_populates="organization", cascade="all, delete-orphan"
    )
    invitations: Mapped[list[Invitation]] = relationship(
        "Invitation", back_populates="organization", cascade="all, delete-orphan"
    )
    projects: Mapped[list[Project]] = relationship(
        "Project", back_populates="organization", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Organization id={self.id} slug={self.slug!r}>"