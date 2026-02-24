from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class ProjectCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    key: str = Field(min_length=2, max_length=5)
    description: str | None = None
    type: str = Field(default="kanban", pattern="^(kanban|scrum)$")

    @field_validator("key")
    @classmethod
    def key_must_be_uppercase(cls, v: str) -> str:
        v = v.strip().upper()
        if not v.isalpha():
            raise ValueError("Project key must contain only letters")
        return v


class ProjectUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = None


class ProjectResponse(BaseModel):
    id: UUID
    org_id: UUID
    name: str
    key: str
    description: str | None
    type: str
    is_archived: bool
    created_by: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectListResponse(BaseModel):
    projects: list[ProjectResponse]
    total: int