"""
Notification dispatch — plain async function, no Celery.
Called via background_tasks.add_task() from task_service.
"""

from __future__ import annotations

import logging
import uuid

from app.core.database import AsyncSessionLocal
from app.core.websocket import manager
from app.models.notification import NotificationType
from app.schemas.notification import NotificationCreate
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)


async def dispatch_notification(
    org_id: str,
    user_id: str,
    notification_type: str,
    title: str,
    body: str | None,
    entity_type: str,
    entity_id: str,
) -> None:
    """
    1. Insert notification row into DB.
    2. Push via WebSocket if user is online.
    3. If user is offline, notification sits in DB — delivered on next poll.
    Errors are caught and logged — never crash the caller.
    """
    try:
        data = NotificationCreate(
            org_id=uuid.UUID(org_id),
            user_id=uuid.UUID(user_id),
            type=NotificationType(notification_type),
            title=title,
            body=body,
            entity_type=entity_type,
            entity_id=uuid.UUID(entity_id),
        )

        async with AsyncSessionLocal() as session:
            service = NotificationService(db=session)
            notification = await service.create(data)
            await session.commit()

        await manager.send_to_user(
            user_id=user_id,
            data={
                "type": "notification",
                "id": str(notification.id),
                "notification_type": notification_type,
                "title": title,
                "body": body,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "is_read": False,
                "created_at": notification.created_at.isoformat(),
            },
        )
    except Exception as exc:
        logger.error("dispatch_notification failed for user %s: %s", user_id, exc)