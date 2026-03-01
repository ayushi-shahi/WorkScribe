"""Dashboard schemas — activity feed and summary stats."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ActivityActorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    display_name: str
    avatar_url: str | None


class ActivityTaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    number: int
    project_key: str


class ActivityEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    action: str
    entity_type: str
    entity_id: UUID
    old_value: dict | str | None
    new_value: dict | str | None
    created_at: datetime
    actor: ActivityActorRead
    task: ActivityTaskRead | None


class ActivityFeedResponse(BaseModel):
    data: list[ActivityEntryRead]
    meta: dict


# ── Dashboard summary ────────────────────────────────────────────────────────


class ActiveSprintSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    project_id: UUID
    project_name: str
    project_key: str
    total_tasks: int
    done_tasks: int


class RecentPageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    space_id: UUID
    space_name: str
    updated_at: datetime


class DashboardResponse(BaseModel):
    open_tasks_count: int
    active_sprints_count: int
    unread_notifications_count: int
    active_sprints: list[ActiveSprintSummary]
    recent_pages: list[RecentPageRead]