"""
Wiki business logic.

Handles wiki spaces and pages (create, read, update, delete, move).
All queries scoped by org_id.
"""

from __future__ import annotations

import uuid
from uuid import UUID

import redis.asyncio as aioredis
from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member import OrgMember, OrgRole
from app.models.user import User
from app.models.wiki import Page, WikiSpace
from app.schemas.wiki import (
    PageCreateRequest,
    PageListResponse,
    PageMoveRequest,
    PageResponse,
    PageTreeItem,
    PageUpdateRequest,
    WikiSpaceCreateRequest,
    WikiSpaceListResponse,
    WikiSpaceResponse,
    WikiSpaceUpdateRequest,
)

MAX_PAGE_DEPTH = 5


class WikiService:
    """Handles all wiki space and page operations."""

    def __init__(self, db: AsyncSession, redis: aioredis.Redis) -> None:
        self.db = db
        self.redis = redis

    # -----------------------------------------------------------------------
    # Wiki Space — List
    # -----------------------------------------------------------------------

    async def list_spaces(self, org_id: UUID) -> WikiSpaceListResponse:
        result = await self.db.execute(
            select(WikiSpace)
            .where(WikiSpace.org_id == org_id)
            .order_by(WikiSpace.created_at)
        )
        spaces = list(result.scalars().all())

        items = []
        for space in spaces:
            page_count = await self._get_page_count(space.id, org_id)
            items.append(self._space_to_response(space, page_count))

        return WikiSpaceListResponse(spaces=items, total=len(items))

    # -----------------------------------------------------------------------
    # Wiki Space — Create
    # -----------------------------------------------------------------------

    async def create_space(
        self, org_id: UUID, user: User, data: WikiSpaceCreateRequest
    ) -> WikiSpaceResponse:
        # Check key uniqueness within org
        existing = await self.db.execute(
            select(WikiSpace).where(
                WikiSpace.org_id == org_id,
                WikiSpace.key == data.key.upper(),
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "KEY_CONFLICT", "message": "A space with this key already exists in the organization"},
            )

        space = WikiSpace(
            org_id=org_id,
            name=data.name,
            key=data.key.upper(),
            description=data.description,
            icon_emoji=data.icon_emoji,
            created_by=user.id,
        )
        self.db.add(space)
        await self.db.flush()
        await self.db.refresh(space)

        return self._space_to_response(space, 0)

    # -----------------------------------------------------------------------
    # Wiki Space — Update
    # -----------------------------------------------------------------------

    async def update_space(
        self, space_id: UUID, org_id: UUID, data: WikiSpaceUpdateRequest
    ) -> WikiSpaceResponse:
        space = await self._get_space(space_id, org_id)

        if data.name is not None:
            space.name = data.name
        if data.description is not None:
            space.description = data.description
        if data.icon_emoji is not None:
            space.icon_emoji = data.icon_emoji

        await self.db.flush()
        await self.db.refresh(space)

        page_count = await self._get_page_count(space.id, org_id)
        return self._space_to_response(space, page_count)

    # -----------------------------------------------------------------------
    # Wiki Space — Delete
    # -----------------------------------------------------------------------

    async def delete_space(self, space_id: UUID, org_id: UUID) -> None:
        space = await self._get_space(space_id, org_id)
        await self.db.delete(space)
        await self.db.flush()

    # -----------------------------------------------------------------------
    # Pages — List (tree)
    # -----------------------------------------------------------------------

    async def list_pages(self, space_id: UUID, org_id: UUID) -> PageListResponse:
        # Verify space belongs to org
        await self._get_space(space_id, org_id)

        result = await self.db.execute(
            select(Page)
            .where(
                Page.space_id == space_id,
                Page.org_id == org_id,
                Page.is_deleted == False,
            )
            .order_by(Page.depth, Page.position)
        )
        pages = list(result.scalars().all())

        tree = self._build_tree(pages)
        return PageListResponse(pages=tree, total=len(pages))

    # -----------------------------------------------------------------------
    # Pages — Create
    # -----------------------------------------------------------------------

    async def create_page(
        self, space_id: UUID, org_id: UUID, user: User, data: PageCreateRequest
    ) -> PageResponse:
        # Verify space
        await self._get_space(space_id, org_id)

        depth = 0
        if data.parent_page_id is not None:
            parent = await self._get_page(data.parent_page_id, org_id)
            if parent.space_id != space_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"code": "INVALID_PARENT", "message": "Parent page must be in the same space"},
                )
            depth = parent.depth + 1
            if depth >= MAX_PAGE_DEPTH:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"code": "MAX_DEPTH_EXCEEDED", "message": f"Pages cannot be nested more than {MAX_PAGE_DEPTH} levels deep"},
                )

        # Get next position among siblings
        position = await self._next_position(space_id, data.parent_page_id, org_id)

        page = Page(
            org_id=org_id,
            space_id=space_id,
            parent_page_id=data.parent_page_id,
            title=data.title,
            content_json=data.content_json,
            icon_emoji=data.icon_emoji,
            position=position,
            depth=depth,
            created_by=user.id,
            last_edited_by=user.id,
        )
        self.db.add(page)
        await self.db.flush()
        await self.db.refresh(page)

        return self._page_to_response(page)

    # -----------------------------------------------------------------------
    # Pages — Get
    # -----------------------------------------------------------------------

    async def get_page(self, page_id: UUID, org_id: UUID) -> PageResponse:
        page = await self._get_page(page_id, org_id)
        return self._page_to_response(page)

    # -----------------------------------------------------------------------
    # Pages — Update
    # -----------------------------------------------------------------------

    async def update_page(
        self, page_id: UUID, org_id: UUID, user: User, data: PageUpdateRequest
    ) -> PageResponse:
        page = await self._get_page(page_id, org_id)

        if data.title is not None:
            page.title = data.title
        if data.content_json is not None:
            page.content_json = data.content_json
        if data.icon_emoji is not None:
            page.icon_emoji = data.icon_emoji

        page.last_edited_by = user.id

        await self.db.flush()
        await self.db.refresh(page)

        return self._page_to_response(page)

    # -----------------------------------------------------------------------
    # Pages — Move
    # -----------------------------------------------------------------------

    async def move_page(
        self, page_id: UUID, org_id: UUID, user: User, data: PageMoveRequest
    ) -> PageResponse:
        page = await self._get_page(page_id, org_id)

        new_depth = 0
        if data.parent_page_id is not None:
            # Cannot move page under itself
            if data.parent_page_id == page_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"code": "INVALID_PARENT", "message": "A page cannot be its own parent"},
                )
            parent = await self._get_page(data.parent_page_id, org_id)
            if parent.space_id != page.space_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"code": "INVALID_PARENT", "message": "Parent page must be in the same space"},
                )
            new_depth = parent.depth + 1
            if new_depth >= MAX_PAGE_DEPTH:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"code": "MAX_DEPTH_EXCEEDED", "message": f"Pages cannot be nested more than {MAX_PAGE_DEPTH} levels deep"},
                )

        page.parent_page_id = data.parent_page_id
        page.position = data.position
        page.depth = new_depth
        page.last_edited_by = user.id

        await self.db.flush()
        await self.db.refresh(page)

        return self._page_to_response(page)

    # -----------------------------------------------------------------------
    # Pages — Delete (soft)
    # -----------------------------------------------------------------------

    async def delete_page(self, page_id: UUID, org_id: UUID) -> None:
        page = await self._get_page(page_id, org_id)
        # Soft delete the page and all its descendants
        await self._soft_delete_recursive(page_id, org_id)
        await self.db.flush()

    # -----------------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------------

    async def _get_space(self, space_id: UUID, org_id: UUID) -> WikiSpace:
        result = await self.db.execute(
            select(WikiSpace).where(
                WikiSpace.id == space_id,
                WikiSpace.org_id == org_id,
            )
        )
        space = result.scalar_one_or_none()
        if space is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "SPACE_NOT_FOUND", "message": "Wiki space not found"},
            )
        return space

    async def _get_page(self, page_id: UUID, org_id: UUID) -> Page:
        result = await self.db.execute(
            select(Page).where(
                Page.id == page_id,
                Page.org_id == org_id,
                Page.is_deleted == False,
            )
        )
        page = result.scalar_one_or_none()
        if page is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "PAGE_NOT_FOUND", "message": "Page not found"},
            )
        return page

    async def _get_page_count(self, space_id: UUID, org_id: UUID) -> int:
        result = await self.db.execute(
            select(func.count(Page.id)).where(
                Page.space_id == space_id,
                Page.org_id == org_id,
                Page.is_deleted == False,
            )
        )
        return result.scalar_one()

    async def _next_position(
        self, space_id: UUID, parent_page_id: UUID | None, org_id: UUID
    ) -> int:
        result = await self.db.execute(
            select(func.count(Page.id)).where(
                Page.space_id == space_id,
                Page.org_id == org_id,
                Page.parent_page_id == parent_page_id,
                Page.is_deleted == False,
            )
        )
        return result.scalar_one()

    async def _soft_delete_recursive(self, page_id: UUID, org_id: UUID) -> None:
        """Soft delete a page and all its descendants."""
        await self.db.execute(
            update(Page)
            .where(Page.id == page_id, Page.org_id == org_id)
            .values(is_deleted=True)
        )
        # Get children and recurse
        children_result = await self.db.execute(
            select(Page.id).where(
                Page.parent_page_id == page_id,
                Page.org_id == org_id,
                Page.is_deleted == False,
            )
        )
        child_ids = [row[0] for row in children_result.all()]
        for child_id in child_ids:
            await self._soft_delete_recursive(child_id, org_id)

    def _build_tree(self, pages: list[Page]) -> list[PageTreeItem]:
        """Build nested tree from flat page list."""
        page_map: dict[uuid.UUID, PageTreeItem] = {}
        roots: list[PageTreeItem] = []

        for page in pages:
            item = PageTreeItem(
                id=page.id,
                space_id=page.space_id,
                parent_page_id=page.parent_page_id,
                title=page.title,
                icon_emoji=page.icon_emoji,
                position=page.position,
                depth=page.depth,
                children=[],
            )
            page_map[page.id] = item

        for page in pages:
            item = page_map[page.id]
            if page.parent_page_id is None:
                roots.append(item)
            elif page.parent_page_id in page_map:
                page_map[page.parent_page_id].children.append(item)

        return roots

    def _space_to_response(self, space: WikiSpace, page_count: int) -> WikiSpaceResponse:
        return WikiSpaceResponse(
            id=space.id,
            org_id=space.org_id,
            name=space.name,
            key=space.key,
            description=space.description,
            icon_emoji=space.icon_emoji,
            created_by=space.created_by,
            created_at=space.created_at,
            updated_at=space.updated_at,
            page_count=page_count,
        )

    def _page_to_response(self, page: Page) -> PageResponse:
        return PageResponse(
            id=page.id,
            org_id=page.org_id,
            space_id=page.space_id,
            parent_page_id=page.parent_page_id,
            title=page.title,
            content_json=page.content_json,
            icon_emoji=page.icon_emoji,
            position=page.position,
            depth=page.depth,
            created_by=page.created_by,
            last_edited_by=page.last_edited_by,
            created_at=page.created_at,
            updated_at=page.updated_at,
        )

    # -----------------------------------------------------------------------
    # Default space creation (called on org creation)
    # -----------------------------------------------------------------------

    async def create_default_space(self, org_id: UUID, user_id: UUID) -> WikiSpace:
        """Create the default 'General' space when an org is created."""
        space = WikiSpace(
            org_id=org_id,
            name="General",
            key="GEN",
            description="General documentation space",
            icon_emoji="📋",
            created_by=user_id,
        )
        self.db.add(space)
        await self.db.flush()
        return space