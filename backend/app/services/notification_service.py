"""
Business logic for notifications.
Handles creation, dispatch, and read-state management.
All queries scoped by org_id / user_id.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification, NotificationType
from app.models.user import User
from app.schemas.notification import (
    NotificationCreate,
    NotificationListResponse,
    NotificationResponse,
)


class NotificationService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ------------------------------------------------------------------
    # Create a notification record in the DB
    # Called from task_service or Celery tasks
    # ------------------------------------------------------------------

    async def create(self, data: NotificationCreate) -> Notification:
        """
        Insert a notification row.
        Does NOT dispatch via WebSocket — that is done by the caller
        (Celery task or notification_tasks.py) after this returns.
        """
        notification = Notification(
            org_id=data.org_id,
            user_id=data.user_id,
            type=data.type,
            title=data.title,
            body=data.body,
            entity_type=data.entity_type,
            entity_id=data.entity_id,
            is_read=False,
        )
        self._db.add(notification)
        await self._db.flush()
        await self._db.refresh(notification)
        return notification

    # ------------------------------------------------------------------
    # GET /notifications
    # ------------------------------------------------------------------

    async def list_notifications(
        self,
        user_id: uuid.UUID,
        org_id: uuid.UUID,
        unread_only: bool = False,
        skip: int = 0,
        limit: int = 25,
    ) -> NotificationListResponse:
        """
        List notifications for the current user, scoped by org.
        Optionally filter to unread only.
        """
        base_stmt = select(Notification).where(
            Notification.user_id == user_id,
            Notification.org_id == org_id,
        )

        if unread_only:
            base_stmt = base_stmt.where(Notification.is_read.is_(False))

        # Total count
        count_stmt = select(func.count()).select_from(
            base_stmt.subquery()
        )
        total = await self._db.scalar(count_stmt) or 0

        # Unread count (always, regardless of filter)
        unread_stmt = select(func.count()).where(
            Notification.user_id == user_id,
            Notification.org_id == org_id,
            Notification.is_read.is_(False),
        )
        unread_count = await self._db.scalar(unread_stmt) or 0

        # Paginated results
        rows_stmt = (
            base_stmt
            .order_by(Notification.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self._db.execute(rows_stmt)
        notifications = result.scalars().all()

        return NotificationListResponse(
            data=[NotificationResponse.model_validate(n) for n in notifications],
            total=total,
            unread_count=unread_count,
        )

    # ------------------------------------------------------------------
    # PATCH /notifications/{id}/read
    # ------------------------------------------------------------------

    async def mark_read(
        self,
        notification_id: uuid.UUID,
        user_id: uuid.UUID,
        org_id: uuid.UUID,
    ) -> NotificationResponse:
        """
        Mark a single notification as read.
        Scoped to user_id + org_id to prevent cross-user updates.
        """
        notification = await self._db.scalar(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
                Notification.org_id == org_id,
            )
        )
        if not notification:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=404,
                detail={
                    "code": "NOTIFICATION_NOT_FOUND",
                    "message": "Notification not found.",
                },
            )

        notification.is_read = True
        await self._db.flush()
        await self._db.refresh(notification)
        return NotificationResponse.model_validate(notification)

    # ------------------------------------------------------------------
    # POST /notifications/mark-all-read
    # ------------------------------------------------------------------

    async def mark_all_read(
        self,
        user_id: uuid.UUID,
        org_id: uuid.UUID,
    ) -> dict[str, int]:
        """
        Mark all unread notifications as read for a user in an org.
        Returns count of updated rows.
        """
        result = await self._db.execute(
            update(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.org_id == org_id,
                Notification.is_read.is_(False),
            )
            .values(is_read=True)
        )
        return {"updated": result.rowcount}