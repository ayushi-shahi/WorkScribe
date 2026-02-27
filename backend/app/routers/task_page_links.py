"""
Task ↔ Page linking endpoints.

POST   /tasks/{task_id}/links              — link a page to a task
DELETE /tasks/{task_id}/links/{page_id}    — unlink
GET    /tasks/{task_id}/links              — list pages linked to a task
GET    /pages/{page_id}/tasks              — list tasks linked to a page
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.member import OrgMember
from app.models.task import Task
from app.models.user import User
from app.models.wiki import Page
from app.schemas.task_page_link import (
    LinkedPagesListResponse,
    LinkedTasksListResponse,
    TaskPageLinkCreateRequest,
    TaskPageLinkResponse,
)
from app.services.task_page_link_service import TaskPageLinkService

router = APIRouter()


def get_link_service(db: AsyncSession = Depends(get_db)) -> TaskPageLinkService:
    return TaskPageLinkService(db=db)


async def _resolve_task_org(
    task_id: UUID,
    current_user: User,
    db: AsyncSession,
) -> UUID:
    """
    Load task, verify current user is an org member, return org_id.
    Raises 404 if task not found, 403 if user not a member.
    """
    task = await db.scalar(select(Task).where(Task.id == task_id))
    if task is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "TASK_NOT_FOUND", "message": "Task not found."},
        )
    member = await db.scalar(
        select(OrgMember).where(
            OrgMember.org_id == task.org_id,
            OrgMember.user_id == current_user.id,
        )
    )
    if member is None:
        raise HTTPException(
            status_code=403,
            detail={"code": "FORBIDDEN", "message": "Access denied."},
        )
    return task.org_id


async def _resolve_page_org(
    page_id: UUID,
    current_user: User,
    db: AsyncSession,
) -> UUID:
    """
    Load page, verify current user is an org member, return org_id.
    Raises 404 if page not found or deleted, 403 if user not a member.
    """
    page = await db.scalar(
        select(Page).where(
            Page.id == page_id,
            Page.is_deleted.is_(False),
        )
    )
    if page is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "PAGE_NOT_FOUND", "message": "Page not found."},
        )
    member = await db.scalar(
        select(OrgMember).where(
            OrgMember.org_id == page.org_id,
            OrgMember.user_id == current_user.id,
        )
    )
    if member is None:
        raise HTTPException(
            status_code=403,
            detail={"code": "FORBIDDEN", "message": "Access denied."},
        )
    return page.org_id


# ---------------------------------------------------------------------------
# POST /tasks/{task_id}/links
# ---------------------------------------------------------------------------

@router.post(
    "/tasks/{task_id}/links",
    response_model=TaskPageLinkResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Link a wiki page to a task",
)
async def link_page_to_task(
    task_id: UUID,
    data: TaskPageLinkCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    service: TaskPageLinkService = Depends(get_link_service),
) -> TaskPageLinkResponse:
    org_id = await _resolve_task_org(task_id, current_user, db)
    return await service.link_page_to_task(
        task_id=task_id,
        page_id=data.page_id,
        org_id=org_id,
        current_user=current_user,
    )


# ---------------------------------------------------------------------------
# DELETE /tasks/{task_id}/links/{page_id}
# ---------------------------------------------------------------------------

@router.delete(
    "/tasks/{task_id}/links/{page_id}",
    status_code=status.HTTP_200_OK,
    summary="Unlink a wiki page from a task",
)
async def unlink_page_from_task(
    task_id: UUID,
    page_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    service: TaskPageLinkService = Depends(get_link_service),
) -> dict:
    org_id = await _resolve_task_org(task_id, current_user, db)
    await service.unlink_page_from_task(
        task_id=task_id,
        page_id=page_id,
        org_id=org_id,
        current_user=current_user,
    )
    return {}


# ---------------------------------------------------------------------------
# GET /tasks/{task_id}/links
# ---------------------------------------------------------------------------

@router.get(
    "/tasks/{task_id}/links",
    response_model=LinkedPagesListResponse,
    summary="List wiki pages linked to a task",
)
async def get_linked_pages(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    service: TaskPageLinkService = Depends(get_link_service),
) -> LinkedPagesListResponse:
    org_id = await _resolve_task_org(task_id, current_user, db)
    return await service.get_linked_pages(task_id=task_id, org_id=org_id)


# ---------------------------------------------------------------------------
# GET /pages/{page_id}/tasks
# ---------------------------------------------------------------------------

@router.get(
    "/pages/{page_id}/tasks",
    response_model=LinkedTasksListResponse,
    summary="List tasks linked to a wiki page",
)
async def get_linked_tasks(
    page_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    service: TaskPageLinkService = Depends(get_link_service),
) -> LinkedTasksListResponse:
    org_id = await _resolve_page_org(page_id, current_user, db)
    return await service.get_linked_tasks(page_id=page_id, org_id=org_id)