"""
Task ORM model.
"""

from __future__ import annotations

import enum
from datetime import date, datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin

if TYPE_CHECKING:
    from app.models.activity_log import ActivityLog
    from app.models.comment import Comment
    from app.models.label import TaskLabel
    from app.models.project import Project
    from app.models.task_status import TaskStatus
    from app.models.user import User


class TaskPriority(str, enum.Enum):
    urgent = "urgent"
    high = "high"
    medium = "medium"
    low = "low"
    none = "none"


class TaskType(str, enum.Enum):
    story = "story"
    bug = "bug"
    task = "task"
    subtask = "subtask"


class Task(Base, UUIDMixin):
    """Represents a work item within a project."""

    __tablename__ = "tasks"

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
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    status_id: Mapped[UUID] = mapped_column(
        ForeignKey("task_statuses.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    assignee_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    reporter_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    priority: Mapped[TaskPriority] = mapped_column(
        Enum(TaskPriority, name="task_priority", create_type=False),
        nullable=False,
        default=TaskPriority.none,
    )
    type: Mapped[TaskType] = mapped_column(
        Enum(TaskType, name="task_type", create_type=False),
        nullable=False,
        default=TaskType.task,
    )
    parent_task_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"),
        nullable=True,
    )
    # sprint_id: plain UUID column — FK added when Sprint model is created
    sprint_id: Mapped[UUID | None] = mapped_column(
        nullable=True,
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    project: Mapped[Project] = relationship("Project", back_populates="tasks")
    status: Mapped[TaskStatus] = relationship("TaskStatus", back_populates="tasks")
    assignee: Mapped[User | None] = relationship(
        "User", foreign_keys=[assignee_id], back_populates="assigned_tasks"
    )
    reporter: Mapped[User] = relationship(
        "User", foreign_keys=[reporter_id], back_populates="reported_tasks"
    )
    parent_task: Mapped[Task | None] = relationship(
        "Task",
        remote_side="Task.id",
        foreign_keys=[parent_task_id],
        back_populates="subtasks",
    )
    subtasks: Mapped[list[Task]] = relationship(
        "Task",
        foreign_keys=[parent_task_id],
        back_populates="parent_task",
    )
    task_labels: Mapped[list[TaskLabel]] = relationship(
        "TaskLabel", back_populates="task", cascade="all, delete-orphan"
    )
    comments: Mapped[list[Comment]] = relationship(
        "Comment", back_populates="task", cascade="all, delete-orphan"
    )
    activity_logs: Mapped[list[ActivityLog]] = relationship(
        "ActivityLog", back_populates="task", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Task id={self.id} number={self.number} project_id={self.project_id}>"