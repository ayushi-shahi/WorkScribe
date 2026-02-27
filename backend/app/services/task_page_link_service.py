"""
Business logic for Task ↔ Page linking.
All queries scoped by org_id.
"""

from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog
from app.models.project import Project
from app.models.task import Task
from app.models.task_page_link import TaskPageLink
from app.models.task_status import TaskStatus
from app.models.user import User
from app.models.wiki import Page, WikiSpace
from app.schemas.task_page_link import (
    LinkedPageResponse,
    LinkedPagesListResponse,
    LinkedTaskResponse,
    LinkedTasksListResponse,
    TaskPageLinkResponse,
)


class TaskPageLinkService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ------------------------------------------------------------------
    # POST /tasks/{task_id}/links
    # ------------------------------------------------------------------

    async def link_page_to_task(
        self,
        task_id: uuid.UUID,
        page_id: uuid.UUID,
        org_id: uuid.UUID,
        current_user: User,
    ) -> TaskPageLinkResponse:
        """
        Create a link between a task and a wiki page.
        Both must belong to the same org. Duplicate links return 409.
        Logs to activity_log.
        """
        # Verify task exists and belongs to org
        task = await self._get_task_or_404(task_id, org_id)

        # Verify page exists and belongs to same org
        page = await self._get_page_or_404(page_id, org_id)

        # Check for duplicate
        existing = await self._db.scalar(
            select(TaskPageLink).where(
                TaskPageLink.task_id == task_id,
                TaskPageLink.page_id == page_id,
            )
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "LINK_ALREADY_EXISTS",
                    "message": "This task is already linked to this page.",
                },
            )

        link = TaskPageLink(
            org_id=org_id,
            task_id=task_id,
            page_id=page_id,
            created_by=current_user.id,
        )
        self._db.add(link)

        # Log to activity_log
        log = ActivityLog(
            org_id=org_id,
            task_id=task_id,
            actor_id=current_user.id,
            action="DOC_LINKED",
            entity_type="page",
            entity_id=page_id,
            old_value=None,
            new_value={"page_id": str(page_id), "page_title": page.title},
        )
        self._db.add(log)

        await self._db.flush()
        await self._db.refresh(link)

        return TaskPageLinkResponse.model_validate(link)

    # ------------------------------------------------------------------
    # DELETE /tasks/{task_id}/links/{page_id}
    # ------------------------------------------------------------------

    async def unlink_page_from_task(
        self,
        task_id: uuid.UUID,
        page_id: uuid.UUID,
        org_id: uuid.UUID,
        current_user: User,
    ) -> None:
        """
        Remove a link between a task and a wiki page.
        Returns 404 if the link does not exist.
        """
        # Verify task belongs to org
        await self._get_task_or_404(task_id, org_id)

        result = await self._db.execute(
            delete(TaskPageLink)
            .where(
                TaskPageLink.task_id == task_id,
                TaskPageLink.page_id == page_id,
                TaskPageLink.org_id == org_id,
            )
            .returning(TaskPageLink.id)
        )
        deleted = result.fetchone()

        if not deleted:
            raise HTTPException(
                status_code=404,
                detail={
                    "code": "LINK_NOT_FOUND",
                    "message": "No link exists between this task and page.",
                },
            )

        # Log to activity_log
        log = ActivityLog(
            org_id=org_id,
            task_id=task_id,
            actor_id=current_user.id,
            action="DOC_UNLINKED",
            entity_type="page",
            entity_id=page_id,
            old_value={"page_id": str(page_id)},
            new_value=None,
        )
        self._db.add(log)

    # ------------------------------------------------------------------
    # GET /tasks/{task_id}/links
    # ------------------------------------------------------------------

    async def get_linked_pages(
        self,
        task_id: uuid.UUID,
        org_id: uuid.UUID,
    ) -> LinkedPagesListResponse:
        """
        List all wiki pages linked to a task.
        Scoped by org_id.
        """
        await self._get_task_or_404(task_id, org_id)

        stmt = (
            select(
                TaskPageLink.id.label("link_id"),
                TaskPageLink.created_by.label("linked_by"),
                TaskPageLink.created_at.label("linked_at"),
                Page.id.label("page_id"),
                Page.space_id,
                Page.title,
                Page.icon_emoji,
                Page.updated_at,
                WikiSpace.name.label("space_name"),
            )
            .join(Page, Page.id == TaskPageLink.page_id)
            .join(WikiSpace, WikiSpace.id == Page.space_id)
            .where(
                TaskPageLink.task_id == task_id,
                TaskPageLink.org_id == org_id,
                Page.is_deleted.is_(False),
            )
            .order_by(TaskPageLink.created_at.desc())
        )

        rows = (await self._db.execute(stmt)).mappings().all()

        items = [
            LinkedPageResponse(
                link_id=row["link_id"],
                page_id=row["page_id"],
                space_id=row["space_id"],
                space_name=row["space_name"],
                title=row["title"],
                icon_emoji=row["icon_emoji"],
                updated_at=row["updated_at"],
                linked_at=row["linked_at"],
                linked_by=row["linked_by"],
            )
            for row in rows
        ]

        return LinkedPagesListResponse(data=items, total=len(items))

    # ------------------------------------------------------------------
    # GET /pages/{page_id}/tasks
    # ------------------------------------------------------------------

    async def get_linked_tasks(
        self,
        page_id: uuid.UUID,
        org_id: uuid.UUID,
    ) -> LinkedTasksListResponse:
        """
        List all tasks linked to a wiki page.
        Scoped by org_id.
        """
        await self._get_page_or_404(page_id, org_id)

        stmt = (
            select(
                TaskPageLink.id.label("link_id"),
                TaskPageLink.created_by.label("linked_by"),
                TaskPageLink.created_at.label("linked_at"),
                Task.id.label("task_id"),
                Task.number,
                Task.title,
                Task.assignee_id,
                TaskStatus.name.label("status_name"),
                TaskStatus.color.label("status_color"),
                Project.key.label("project_key"),
                User.display_name.label("assignee_name"),
            )
            .join(Task, Task.id == TaskPageLink.task_id)
            .join(TaskStatus, TaskStatus.id == Task.status_id)
            .join(Project, Project.id == Task.project_id)
            .outerjoin(User, User.id == Task.assignee_id)
            .where(
                TaskPageLink.page_id == page_id,
                TaskPageLink.org_id == org_id,
            )
            .order_by(TaskPageLink.created_at.desc())
        )

        rows = (await self._db.execute(stmt)).mappings().all()

        items = [
            LinkedTaskResponse(
                link_id=row["link_id"],
                task_id=row["task_id"],
                project_key=row["project_key"],
                number=row["number"],
                title=row["title"],
                status_name=row["status_name"],
                status_color=row["status_color"],
                assignee_id=row["assignee_id"],
                assignee_name=row["assignee_name"],
                linked_at=row["linked_at"],
                linked_by=row["linked_by"],
            )
            for row in rows
        ]

        return LinkedTasksListResponse(data=items, total=len(items))

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _get_task_or_404(self, task_id: uuid.UUID, org_id: uuid.UUID) -> Task:
        task = await self._db.scalar(
            select(Task).where(
                Task.id == task_id,
                Task.org_id == org_id,
            )
        )
        if not task:
            raise HTTPException(
                status_code=404,
                detail={"code": "TASK_NOT_FOUND", "message": "Task not found."},
            )
        return task

    async def _get_page_or_404(self, page_id: uuid.UUID, org_id: uuid.UUID) -> Page:
        page = await self._db.scalar(
            select(Page).where(
                Page.id == page_id,
                Page.org_id == org_id,
                Page.is_deleted.is_(False),
            )
        )
        if not page:
            raise HTTPException(
                status_code=404,
                detail={"code": "PAGE_NOT_FOUND", "message": "Page not found."},
            )
        return page