import os

content = """\
from __future__ import annotations

import enum
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.user import User


class ProjectType(str, enum.Enum):
    kanban = "kanban"
    scrum = "scrum"


class Project(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "projects"

    org_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    key: Mapped[str] = mapped_column(String(5), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    type: Mapped[ProjectType] = mapped_column(
        Enum(ProjectType, name="project_type", create_type=False),
        nullable=False,
        default=ProjectType.kanban,
    )
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    organization: Mapped[Organization] = relationship(
        "Organization", back_populates="projects"
    )
    creator: Mapped[User] = relationship(
        "User", back_populates="projects_created"
    )

    def __repr__(self) -> str:
        return f"<Project id={self.id} key={self.key!r} org_id={self.org_id}>"
"""

path = os.path.join("app", "models", "project.py")
with open(path, "w", newline="\n") as f:
    f.write(content)
print("Created:", os.path.abspath(path))
