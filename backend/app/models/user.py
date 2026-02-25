"""
User ORM model.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.activity_log import ActivityLog
    from app.models.comment import Comment
    from app.models.invitation import Invitation
    from app.models.member import OrgMember
    from app.models.project import Project
    from app.models.task import Task


class User(Base, UUIDMixin, TimestampMixin):
    """Represents an authenticated user (email/password or OAuth)."""

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # OAuth fields
    oauth_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    oauth_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Relationships
    org_memberships: Mapped[list[OrgMember]] = relationship(
        "OrgMember", back_populates="user", cascade="all, delete-orphan"
    )
    invitations_created: Mapped[list[Invitation]] = relationship(
        "Invitation", back_populates="created_by_user", cascade="all, delete-orphan"
    )
    projects_created: Mapped[list[Project]] = relationship(
        "Project", back_populates="creator"
    )
    assigned_tasks: Mapped[list[Task]] = relationship(
        "Task", foreign_keys="Task.assignee_id", back_populates="assignee"
    )
    reported_tasks: Mapped[list[Task]] = relationship(
        "Task", foreign_keys="Task.reporter_id", back_populates="reporter"
    )
    comments: Mapped[list[Comment]] = relationship(
        "Comment", back_populates="author", cascade="all, delete-orphan"
    )
    activity_logs: Mapped[list[ActivityLog]] = relationship(
        "ActivityLog", back_populates="actor"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r}>"