"""
Pydantic schemas for notifications.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.notification import NotificationType


# ---------------------------------------------------------------------------
# Response Schemas
# ---------------------------------------------------------------------------

class NotificationResponse(BaseModel):
    """Single notification response."""
    id: uuid.UUID
    org_id: uuid.UUID
    user_id: uuid.UUID
    type: NotificationType
    title: str
    body: str | None
    entity_type: str
    entity_id: uuid.UUID
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationListResponse(BaseModel):
    """Response for GET /notifications."""
    data: list[NotificationResponse]
    total: int
    unread_count: int


# ---------------------------------------------------------------------------
# Internal schema used by notification_service to create notifications
# ---------------------------------------------------------------------------

class NotificationCreate(BaseModel):
    """Internal schema for creating a notification (not exposed via API)."""
    org_id: uuid.UUID
    user_id: uuid.UUID
    type: NotificationType
    title: str
    body: str | None = None
    entity_type: str
    entity_id: uuid.UUID