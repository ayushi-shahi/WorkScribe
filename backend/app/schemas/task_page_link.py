"""
Pydantic schemas for Task ↔ Page linking.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Request Schemas
# ---------------------------------------------------------------------------

class TaskPageLinkCreateRequest(BaseModel):
    """Request body for POST /tasks/{task_id}/links."""
    page_id: uuid.UUID


# ---------------------------------------------------------------------------
# Response Schemas
# ---------------------------------------------------------------------------

class LinkedPageResponse(BaseModel):
    """
    Page summary returned when listing pages linked to a task.
    GET /tasks/{task_id}/links
    """
    link_id: uuid.UUID
    page_id: uuid.UUID
    space_id: uuid.UUID
    space_name: str
    title: str
    icon_emoji: str | None
    updated_at: datetime
    linked_at: datetime
    linked_by: uuid.UUID | None


class LinkedTaskResponse(BaseModel):
    """
    Task summary returned when listing tasks linked to a page.
    GET /pages/{page_id}/tasks
    """
    link_id: uuid.UUID
    task_id: uuid.UUID
    project_key: str
    number: int
    title: str
    status_name: str
    status_color: str | None
    assignee_id: uuid.UUID | None
    assignee_name: str | None
    linked_at: datetime
    linked_by: uuid.UUID | None


class TaskPageLinkResponse(BaseModel):
    """Confirmation response after creating a link."""
    id: uuid.UUID
    org_id: uuid.UUID
    task_id: uuid.UUID
    page_id: uuid.UUID
    created_by: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class LinkedPagesListResponse(BaseModel):
    """Response for GET /tasks/{task_id}/links."""
    data: list[LinkedPageResponse]
    total: int


class LinkedTasksListResponse(BaseModel):
    """Response for GET /pages/{page_id}/tasks."""
    data: list[LinkedTaskResponse]
    total: int