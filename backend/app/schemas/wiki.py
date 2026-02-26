"""
Pydantic schemas for Wiki Spaces and Pages.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Wiki Space Schemas
# ---------------------------------------------------------------------------

class WikiSpaceCreateRequest(BaseModel):
    """Request body for POST /organizations/{slug}/wiki/spaces."""
    name: str = Field(..., min_length=1, max_length=255)
    key: str = Field(..., min_length=1, max_length=10, pattern=r"^[A-Z0-9]+$")
    description: str | None = None
    icon_emoji: str | None = None


class WikiSpaceUpdateRequest(BaseModel):
    """Request body for PATCH /wiki/spaces/{space_id}."""
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    icon_emoji: str | None = None


class WikiSpaceResponse(BaseModel):
    """Wiki space detail response."""
    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    key: str
    description: str | None
    icon_emoji: str | None
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    page_count: int = 0

    model_config = {"from_attributes": True}


class WikiSpaceListResponse(BaseModel):
    """Response for GET /organizations/{slug}/wiki/spaces."""
    spaces: list[WikiSpaceResponse]
    total: int


# ---------------------------------------------------------------------------
# Page Schemas
# ---------------------------------------------------------------------------

class PageCreateRequest(BaseModel):
    """Request body for POST /wiki/spaces/{space_id}/pages."""
    title: str = Field(..., min_length=1, max_length=500)
    parent_page_id: uuid.UUID | None = None
    icon_emoji: str | None = None
    content_json: dict[str, Any] | None = None


class PageUpdateRequest(BaseModel):
    """Request body for PATCH /wiki/pages/{page_id}."""
    title: str | None = Field(None, min_length=1, max_length=500)
    content_json: dict[str, Any] | None = None
    icon_emoji: str | None = None


class PageMoveRequest(BaseModel):
    """Request body for POST /wiki/pages/{page_id}/move."""
    parent_page_id: uuid.UUID | None = None
    position: int = Field(..., ge=0)


class PageTreeItem(BaseModel):
    """Lightweight page for tree view."""
    id: uuid.UUID
    space_id: uuid.UUID
    parent_page_id: uuid.UUID | None
    title: str
    icon_emoji: str | None
    position: int
    depth: int
    children: list[PageTreeItem] = []

    model_config = {"from_attributes": True}


# Required for self-referential model
PageTreeItem.model_rebuild()


class PageResponse(BaseModel):
    """Full page detail response."""
    id: uuid.UUID
    org_id: uuid.UUID
    space_id: uuid.UUID
    parent_page_id: uuid.UUID | None
    title: str
    content_json: dict[str, Any] | None
    icon_emoji: str | None
    position: int
    depth: int
    created_by: uuid.UUID | None
    last_edited_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PageListResponse(BaseModel):
    """Response for GET /wiki/spaces/{space_id}/pages (full tree)."""
    pages: list[PageTreeItem]
    total: int