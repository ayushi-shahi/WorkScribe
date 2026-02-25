"""
Label and TaskLabel ORM models.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin

if TYPE_CHECKING:
    from app.models.project import Project
    from app.models.task import Task


class Label(Base, UUIDMixin):
    """A label/tag that can be applied to tasks within a project."""

    __tablename__ = "labels"

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
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#6366f1")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    project: Mapped[Project] = relationship("Project", back_populates="labels")
    task_labels: Mapped[list[TaskLabel]] = relationship(
        "TaskLabel", back_populates="label", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Label id={self.id} name={self.name!r} project_id={self.project_id}>"


class TaskLabel(Base):
    """Junction table linking tasks to labels."""

    __tablename__ = "task_labels"

    task_id: Mapped[UUID] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"),
        primary_key=True,
    )
    label_id: Mapped[UUID] = mapped_column(
        ForeignKey("labels.id", ondelete="CASCADE"),
        primary_key=True,
    )

    # Relationships
    task: Mapped[Task] = relationship("Task", back_populates="task_labels")
    label: Mapped[Label] = relationship("Label", back_populates="task_labels")

    def __repr__(self) -> str:
        return f"<TaskLabel task_id={self.task_id} label_id={self.label_id}>"