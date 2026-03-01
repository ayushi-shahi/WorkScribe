"""Dashboard router — activity feed and summary stats."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_org_member
from app.models.user import User
from app.schemas.dashboard import ActivityFeedResponse, DashboardResponse
from app.services.dashboard_service import DashboardService

router = APIRouter(tags=["dashboard"])


@router.get(
    "/organizations/{slug}/activity",
    response_model=ActivityFeedResponse,
)
async def get_org_activity(
    slug: str,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    org_member=Depends(get_org_member),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ActivityFeedResponse:
    """Return paginated org-level activity feed, newest first."""
    org, _member = org_member

    service = DashboardService(db)
    entries, total = await service.get_activity_feed(
        org_id=org.id,
        limit=limit,
        skip=skip,
    )

    return ActivityFeedResponse(
        data=entries,
        meta={"total": total, "skip": skip, "limit": limit},
    )


@router.get(
    "/organizations/{slug}/dashboard",
    response_model=DashboardResponse,
)
async def get_dashboard(
    slug: str,
    org_member=Depends(get_org_member),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DashboardResponse:
    """Return dashboard summary stats for the org."""
    org, _member = org_member

    service = DashboardService(db)
    return await service.get_dashboard_summary(
        org_id=org.id,
        user_id=current_user.id,
    )