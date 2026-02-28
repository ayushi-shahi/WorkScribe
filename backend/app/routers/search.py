"""
Search router.
GET /api/v1/organizations/{slug}/search
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_org_member
from app.models.organization import Organization
from app.models.member import OrgMember
from app.models.user import User
from app.services.search_service import SearchService

router = APIRouter(tags=["search"])


@router.get("/organizations/{slug}/search")
async def search(
    slug: str,
    q: Annotated[str, Query(min_length=1, max_length=200)],
    type: Annotated[str | None, Query(pattern="^(task|page)$")] = None,
    current_user: User = Depends(get_current_user),
    org_member: tuple[Organization, OrgMember] = Depends(get_org_member),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org, member = org_member

    service = SearchService(db=db)
    results = await service.search(
        org_id=org.id,
        q=q,
        type_filter=type,
    )
    return {"results": results, "total": len(results), "q": q}