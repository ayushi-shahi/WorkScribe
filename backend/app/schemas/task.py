"""
Task schemas.

Request/response models for task CRUD, comments, and activity endpoints.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Task Create
# ---------------------------------------------------------------------------

class TaskCreateRequest(BaseModel):
    """Request body for POST /projects/{project_id}/tasks."""

    title: str = Field(min_length=1, max_length=500)
    description_json: dict[str, Any] | None = None
    status_id: UUID
    assignee_id: UUID | None = None
    priority: str = Field(default="none", pattern="^(urgent|high|medium|low|none)$")
    type: str = Field(default="task", pattern="^(story|bug|task|subtask)$")
    parent_task_id: UUID | None = None
    sprint_id: UUID | None = None
    due_date: date | None = None
    label_ids: list[UUID] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Task Update
# ---------------------------------------------------------------------------

class TaskUpdateRequest(BaseModel):
    """Request body for PATCH /tasks/{task_id}."""

    title: str | None = Field(default=None, min_length=1, max_length=500)
    description_json: dict[str, Any] | None = None
    status_id: UUID | None = None
    assignee_id: UUID | None = None
    priority: str | None = Field(default=None, pattern="^(urgent|high|medium|low|none)$")
    type: str | None = Field(default=None, pattern="^(story|bug|task|subtask)$")
    parent_task_id: UUID | None = None
    sprint_id: UUID | None = None
    due_date: date | None = None
    label_ids: list[UUID] | None = None


# ---------------------------------------------------------------------------
# Task Move (board drag-and-drop)
# ---------------------------------------------------------------------------

class TaskMoveRequest(BaseModel):
    """Request body for PATCH /tasks/{task_id}/move."""

    status_id: UUID
    position: int = Field(ge=0)


# ---------------------------------------------------------------------------
# Bulk position update (reorder within column)
# ---------------------------------------------------------------------------

class TaskPositionItem(BaseModel):
    task_id: UUID
    position: int = Field(ge=0)


class BulkPositionRequest(BaseModel):
    """Request body for PATCH /tasks/bulk-positions."""

    positions: list[TaskPositionItem] = Field(min_length=1)


# ---------------------------------------------------------------------------
# Nested response objects
# ---------------------------------------------------------------------------

class LabelResponse(BaseModel):
    id: UUID
    name: str
    color: str

    model_config = {"from_attributes": True}


class UserSummaryResponse(BaseModel):
    """Compact user info embedded in task responses."""

    id: UUID
    display_name: str
    avatar_url: str | None
    email: str

    model_config = {"from_attributes": True}


class StatusSummaryResponse(BaseModel):
    """Compact status info embedded in task responses."""

    id: UUID
    name: str
    category: str
    color: str | None
    position: int

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Task list item (lightweight — for board and list views)
# ---------------------------------------------------------------------------

class TaskListItem(BaseModel):
    """Lightweight task representation for list/board views."""

    id: UUID
    org_id: UUID
    project_id: UUID
    number: int
    title: str
    status_id: UUID
    assignee_id: UUID | None
    reporter_id: UUID
    priority: str
    type: str
    parent_task_id: UUID | None
    sprint_id: UUID | None
    position: int
    due_date: date | None
    created_at: datetime
    updated_at: datetime
    labels: list[LabelResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class TaskListResponse(BaseModel):
    """Response for GET /projects/{project_id}/tasks."""

    tasks: list[TaskListItem]
    total: int
    skip: int
    limit: int


# ---------------------------------------------------------------------------
# Task detail (full — for task panel)
# ---------------------------------------------------------------------------

class TaskDetailResponse(BaseModel):
    """Full task detail including related data."""

    id: UUID
    org_id: UUID
    project_id: UUID
    number: int
    title: str
    description_json: dict[str, Any] | None
    status_id: UUID
    assignee_id: UUID | None
    reporter_id: UUID
    priority: str
    type: str
    parent_task_id: UUID | None
    sprint_id: UUID | None
    position: int
    due_date: date | None
    created_at: datetime
    updated_at: datetime
    labels: list[LabelResponse] = Field(default_factory=list)
    assignee: UserSummaryResponse | None = None
    reporter: UserSummaryResponse | None = None
    subtask_count: int = 0
    comment_count: int = 0

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------

class CommentCreateRequest(BaseModel):
    """Request body for POST /tasks/{task_id}/comments."""

    body_json: dict[str, Any] = Field(description="Tiptap/ProseMirror JSON content")


class CommentUpdateRequest(BaseModel):
    """Request body for PATCH /comments/{comment_id}."""

    body_json: dict[str, Any]


class CommentResponse(BaseModel):
    id: UUID
    task_id: UUID
    author_id: UUID
    body_json: dict[str, Any]
    is_edited: bool
    created_at: datetime
    updated_at: datetime
    author: UserSummaryResponse | None = None

    model_config = {"from_attributes": True}


class CommentListResponse(BaseModel):
    comments: list[CommentResponse]
    total: int


# ---------------------------------------------------------------------------
# Activity log
# ---------------------------------------------------------------------------

class ActivityResponse(BaseModel):
    id: UUID
    org_id: UUID
    task_id: UUID | None
    actor_id: UUID
    action: str
    entity_type: str
    entity_id: UUID
    old_value: dict[str, Any] | None
    new_value: dict[str, Any] | None
    created_at: datetime
    actor: UserSummaryResponse | None = None

    model_config = {"from_attributes": True}


class ActivityListResponse(BaseModel):
    activities: list[ActivityResponse]
    total: int