"""
Wiki space and page management endpoints.
"""

from __future__ import annotations

from uuid import UUID

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_org_member, get_redis, require_role
from app.models.member import OrgMember, OrgRole
from app.models.organization import Organization
from app.models.user import User
from app.schemas.wiki import (
    PageCreateRequest,
    PageListResponse,
    PageMoveRequest,
    PageResponse,
    PageUpdateRequest,
    WikiSpaceCreateRequest,
    WikiSpaceListResponse,
    WikiSpaceResponse,
    WikiSpaceUpdateRequest,
)
from app.services.wiki_service import WikiService

router = APIRouter()


def get_wiki_service(
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> WikiService:
    return WikiService(db=db, redis=redis)


# ---------------------------------------------------------------------------
# Wiki Spaces
# ---------------------------------------------------------------------------

@router.get(
    "/organizations/{slug}/wiki/spaces",
    response_model=WikiSpaceListResponse,
    summary="List wiki spaces for an organization",
)
async def list_spaces(
    org_and_member: tuple[Organization, OrgMember] = Depends(get_org_member),
    service: WikiService = Depends(get_wiki_service),
) -> WikiSpaceListResponse:
    org, _ = org_and_member
    return await service.list_spaces(org.id)


@router.post(
    "/organizations/{slug}/wiki/spaces",
    response_model=WikiSpaceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new wiki space",
)
async def create_space(
    data: WikiSpaceCreateRequest,
    org_and_member: tuple[Organization, OrgMember] = Depends(
        require_role(OrgRole.owner, OrgRole.admin)
    ),
    current_user: User = Depends(get_current_user),
    service: WikiService = Depends(get_wiki_service),
) -> WikiSpaceResponse:
    org, _ = org_and_member
    return await service.create_space(org.id, current_user, data)


@router.patch(
    "/wiki/spaces/{space_id}",
    response_model=WikiSpaceResponse,
    summary="Update a wiki space",
)
async def update_space(
    space_id: UUID,
    data: WikiSpaceUpdateRequest,
    current_user: User = Depends(get_current_user),
    service: WikiService = Depends(get_wiki_service),
) -> WikiSpaceResponse:
    org_id = await _get_org_id_for_space(space_id, current_user, service)
    return await service.update_space(space_id, org_id, data)


@router.delete(
    "/wiki/spaces/{space_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a wiki space",
)
async def delete_space(
    space_id: UUID,
    current_user: User = Depends(get_current_user),
    service: WikiService = Depends(get_wiki_service),
) -> dict:
    org_id = await _get_org_id_for_space(space_id, current_user, service, require_admin=True)
    await service.delete_space(space_id, org_id)
    return {}


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------

@router.get(
    "/wiki/spaces/{space_id}/pages",
    response_model=PageListResponse,
    summary="List pages in a space (tree)",
)
async def list_pages(
    space_id: UUID,
    current_user: User = Depends(get_current_user),
    service: WikiService = Depends(get_wiki_service),
) -> PageListResponse:
    org_id = await _get_org_id_for_space(space_id, current_user, service)
    return await service.list_pages(space_id, org_id)


@router.post(
    "/wiki/spaces/{space_id}/pages",
    response_model=PageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new page in a space",
)
async def create_page(
    space_id: UUID,
    data: PageCreateRequest,
    current_user: User = Depends(get_current_user),
    service: WikiService = Depends(get_wiki_service),
) -> PageResponse:
    org_id = await _get_org_id_for_space(space_id, current_user, service)
    return await service.create_page(space_id, org_id, current_user, data)


@router.get(
    "/wiki/pages/{page_id}",
    response_model=PageResponse,
    summary="Get page detail",
)
async def get_page(
    page_id: UUID,
    current_user: User = Depends(get_current_user),
    service: WikiService = Depends(get_wiki_service),
) -> PageResponse:
    org_id = await _get_org_id_for_page(page_id, current_user, service)
    return await service.get_page(page_id, org_id)


@router.patch(
    "/wiki/pages/{page_id}",
    response_model=PageResponse,
    summary="Update page content or title",
)
async def update_page(
    page_id: UUID,
    data: PageUpdateRequest,
    current_user: User = Depends(get_current_user),
    service: WikiService = Depends(get_wiki_service),
) -> PageResponse:
    org_id = await _get_org_id_for_page(page_id, current_user, service)
    return await service.update_page(page_id, org_id, current_user, data)


@router.post(
    "/wiki/pages/{page_id}/move",
    response_model=PageResponse,
    summary="Move a page in the tree",
)
async def move_page(
    page_id: UUID,
    data: PageMoveRequest,
    current_user: User = Depends(get_current_user),
    service: WikiService = Depends(get_wiki_service),
) -> PageResponse:
    org_id = await _get_org_id_for_page(page_id, current_user, service)
    return await service.move_page(page_id, org_id, current_user, data)


@router.delete(
    "/wiki/pages/{page_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a page (soft delete)",
)
async def delete_page(
    page_id: UUID,
    current_user: User = Depends(get_current_user),
    service: WikiService = Depends(get_wiki_service),
) -> dict:
    org_id = await _get_org_id_for_page(page_id, current_user, service)
    await service.delete_page(page_id, org_id)
    return {}


# ---------------------------------------------------------------------------
# Internal helpers — resolve org_id from space/page + verify membership
# ---------------------------------------------------------------------------

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.wiki import WikiSpace, Page
from app.models.member import OrgMember
from fastapi import HTTPException


async def _get_org_id_for_space(
    space_id: UUID,
    user: User,
    service: WikiService,
    require_admin: bool = False,
) -> UUID:
    result = await service.db.execute(
        select(WikiSpace).where(WikiSpace.id == space_id)
    )
    space = result.scalar_one_or_none()
    if space is None:
        raise HTTPException(status_code=404, detail={"code": "SPACE_NOT_FOUND", "message": "Wiki space not found"})

    await _verify_membership(space.org_id, user, service, require_admin)
    return space.org_id


async def _get_org_id_for_page(
    page_id: UUID,
    user: User,
    service: WikiService,
    require_admin: bool = False,
) -> UUID:
    result = await service.db.execute(
        select(Page).where(Page.id == page_id, Page.is_deleted == False)
    )
    page = result.scalar_one_or_none()
    if page is None:
        raise HTTPException(status_code=404, detail={"code": "PAGE_NOT_FOUND", "message": "Page not found"})

    await _verify_membership(page.org_id, user, service, require_admin)
    return page.org_id


async def _verify_membership(
    org_id: UUID,
    user: User,
    service: WikiService,
    require_admin: bool = False,
) -> None:
    result = await service.db.execute(
        select(OrgMember).where(
            OrgMember.org_id == org_id,
            OrgMember.user_id == user.id,
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Not found"})
    if require_admin and member.role not in (OrgRole.owner, OrgRole.admin):
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Owner or Admin role required"})