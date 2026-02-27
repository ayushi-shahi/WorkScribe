"""
Notification endpoints.

GET    /notifications               — list user notifications (paginated)
PATCH  /notifications/{id}/read     — mark single notification as read
POST   /notifications/mark-all-read — mark all notifications as read
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.member import OrgMember
from app.models.user import User
from app.schemas.notification import NotificationListResponse, NotificationResponse
from app.services.notification_service import NotificationService

router = APIRouter()


def get_notification_service(
    db: AsyncSession = Depends(get_db),
) -> NotificationService:
    return NotificationService(db=db)


async def _resolve_org_id(
    current_user: User,
    db: AsyncSession,
) -> UUID:
    """
    Resolve the org_id for the current user.
    Uses the first org membership found.
    For multi-org support this would use a slug param — MVP uses single active org.
    """
    member = await db.scalar(
        select(OrgMember).where(OrgMember.user_id == current_user.id)
    )
    if member is None:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=403,
            detail={"code": "NO_ORG", "message": "User is not a member of any organization."},
        )
    return member.org_id


# ---------------------------------------------------------------------------
# GET /notifications
# ---------------------------------------------------------------------------

@router.get(
    "/notifications",
    response_model=NotificationListResponse,
    summary="List notifications for current user",
)
async def list_notifications(
    unread: bool = Query(default=False, description="Filter to unread only"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    service: NotificationService = Depends(get_notification_service),
) -> NotificationListResponse:
    org_id = await _resolve_org_id(current_user, db)
    return await service.list_notifications(
        user_id=current_user.id,
        org_id=org_id,
        unread_only=unread,
        skip=skip,
        limit=limit,
    )


# ---------------------------------------------------------------------------
# PATCH /notifications/{notification_id}/read
# ---------------------------------------------------------------------------

@router.patch(
    "/notifications/{notification_id}/read",
    response_model=NotificationResponse,
    summary="Mark a single notification as read",
)
async def mark_notification_read(
    notification_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    service: NotificationService = Depends(get_notification_service),
) -> NotificationResponse:
    org_id = await _resolve_org_id(current_user, db)
    return await service.mark_read(
        notification_id=notification_id,
        user_id=current_user.id,
        org_id=org_id,
    )


# ---------------------------------------------------------------------------
# POST /notifications/mark-all-read
# ---------------------------------------------------------------------------

@router.post(
    "/notifications/mark-all-read",
    status_code=status.HTTP_200_OK,
    summary="Mark all notifications as read",
)
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    service: NotificationService = Depends(get_notification_service),
) -> dict:
    org_id = await _resolve_org_id(current_user, db)
    return await service.mark_all_read(
        user_id=current_user.id,
        org_id=org_id,
    )