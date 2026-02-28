"""
Notification background tasks.
Inserts notification to DB and dispatches via WebSocket if user is online.
"""

from __future__ import annotations

import asyncio
import logging

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    name="app.workers.notification_tasks.dispatch_notification",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
)
def dispatch_notification(
    self,
    org_id: str,
    user_id: str,
    notification_type: str,
    title: str,
    body: str | None,
    entity_type: str,
    entity_id: str,
) -> dict[str, str]:
    """
    1. Insert notification row into DB via NotificationService.
    2. Attempt real-time dispatch via ConnectionManager.
    3. If user is offline, notification sits in DB — delivered on next poll.
    """
    try:
        # Always create a fresh event loop — avoids "attached to a different loop"
        # error that occurs when Celery forks workers that inherit a closed loop.
        from app.core.database import async_engine
        async_engine.sync_engine.dispose() 
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_create_and_dispatch(
                org_id=org_id,
                user_id=user_id,
                notification_type=notification_type,
                title=title,
                body=body,
                entity_type=entity_type,
                entity_id=entity_id,
            ))
        finally:
            loop.close()
        return {"status": "dispatched", "user_id": user_id}
    except Exception as exc:
        logger.error("dispatch_notification failed: %s", exc)
        raise self.retry(exc=exc)


async def _create_and_dispatch(
    org_id: str,
    user_id: str,
    notification_type: str,
    title: str,
    body: str | None,
    entity_type: str,
    entity_id: str,
) -> None:
    """Async helper: write to DB then push via WebSocket."""
    import uuid

    from app.core.database import AsyncSessionLocal, async_engine
    from app.core.websocket import manager
    from app.models.notification import NotificationType
    from app.schemas.notification import NotificationCreate
    from app.services.notification_service import NotificationService
    

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

    # Dispatch to WebSocket if user is online
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