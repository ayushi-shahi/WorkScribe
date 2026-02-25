"""
TaskStatus ORM model.
"""

from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin

if TYPE_CHECKING:
    from app.models.project import Project
    from app.models.task import Task


class StatusCategory(str, enum.Enum):
    todo = "todo"
    in_progress = "in_progress"
    done = "done"


class TaskStatus(Base, UUIDMixin):
    """Represents a status column within a project (e.g. To Do, In Progress)."""

    __tablename__ = "task_statuses"

    org_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[StatusCategory] = mapped_column(
        Enum(StatusCategory, name="status_category", create_type=False),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    project: Mapped[Project] = relationship("Project", back_populates="statuses")
    tasks: Mapped[list[Task]] = relationship("Task", back_populates="status")

    def __repr__(self) -> str:
        return f"<TaskStatus id={self.id} name={self.name!r} project_id={self.project_id}>"