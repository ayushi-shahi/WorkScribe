"""
Notification background tasks.

Creates and dispatches real-time notifications.
Placeholder — full implementation added in Phase 6.
"""

from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.notification_tasks.dispatch_notification")
def dispatch_notification(
    user_id: str,
    notification_type: str,
    title: str,
    body: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
) -> dict[str, str]:
    """
    Placeholder for notification dispatch task.

    Full implementation added in Phase 6 (WebSocket + notification service).
    """
    return {"status": "queued", "user_id": user_id}