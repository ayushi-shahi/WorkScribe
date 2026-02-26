"""
Sprint schemas.

Request/response models for sprint endpoints.
"""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class SprintCreateRequest(BaseModel):
    """Request body for POST /projects/{project_id}/sprints."""

    name: str = Field(min_length=1, max_length=100)
    goal: str | None = None
    start_date: date | None = None
    end_date: date | None = None


class SprintUpdateRequest(BaseModel):
    """Request body for PATCH /sprints/{sprint_id}."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    goal: str | None = None
    start_date: date | None = None
    end_date: date | None = None


class SprintCompleteRequest(BaseModel):
    """Request body for POST /sprints/{sprint_id}/complete."""

    incomplete_action: str = Field(pattern="^(backlog|sprint)$")
    target_sprint_id: UUID | None = None


class SprintResponse(BaseModel):
    """Sprint detail response."""

    id: UUID
    org_id: UUID
    project_id: UUID
    name: str
    goal: str | None
    status: str
    start_date: date | None
    end_date: date | None
    created_at: datetime
    updated_at: datetime
    task_count: int = 0
    completed_task_count: int = 0

    model_config = {"from_attributes": True}


class SprintListResponse(BaseModel):
    """Response for GET /projects/{project_id}/sprints."""

    sprints: list[SprintResponse]
    total: int