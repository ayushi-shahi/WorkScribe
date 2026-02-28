"""
Search business logic.
ILIKE search across task titles and page titles scoped by org_id.
Respects soft-deletes: excludes archived projects and deleted pages.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task
from app.models.task_status import TaskStatus
from app.models.project import Project
from app.models.wiki import Page, WikiSpace


class SearchService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def search(
        self,
        org_id: UUID,
        q: str,
        type_filter: str | None = None,
    ) -> list[dict]:
        results: list[dict] = []

        if type_filter is None or type_filter == "task":
            results.extend(await self._search_tasks(org_id, q))

        if type_filter is None or type_filter == "page":
            results.extend(await self._search_pages(org_id, q))

        def sort_key(r: dict) -> tuple:
            exact = r["title"].lower() == q.lower()
            return (not exact, r["updated_at"])

        results.sort(key=sort_key)
        return results

    async def _search_tasks(self, org_id: UUID, q: str) -> list[dict]:
        pattern = f"%{q}%"

        stmt = (
            select(Task, TaskStatus, Project)
            .join(TaskStatus, Task.status_id == TaskStatus.id)
            .join(Project, Task.project_id == Project.id)
            .where(
                Task.org_id == org_id,
                Task.title.ilike(pattern),
                Project.is_archived.isnot(True),
            )
            .order_by(Task.updated_at.desc())
            .limit(20)
        )

        result = await self.db.execute(stmt)
        rows = result.all()

        out = []
        for task, task_status, project in rows:
            out.append({
                "type": "task",
                "id": str(task.id),
                "title": task.title,
                "subtitle": f"{project.key}-{task.number} · {task_status.name}",
                "entity_id": str(task.id),
                "project_key": project.key,
                "task_number": task.number,
                "status": task_status.name,
                "updated_at": task.updated_at,
            })
        return out

    async def _search_pages(self, org_id: UUID, q: str) -> list[dict]:
        pattern = f"%{q}%"

        stmt = (
            select(Page, WikiSpace)
            .join(WikiSpace, Page.space_id == WikiSpace.id)
            .where(
                Page.org_id == org_id,
                Page.title.ilike(pattern),
                Page.is_deleted.is_(False),
            )
            .order_by(Page.updated_at.desc())
            .limit(20)
        )

        result = await self.db.execute(stmt)
        rows = result.all()

        out = []
        for page, space in rows:
            out.append({
                "type": "page",
                "id": str(page.id),
                "title": page.title,
                "subtitle": space.name,
                "entity_id": str(page.id),
                "space_id": str(page.space_id),
                "space_name": space.name,
                "updated_at": page.updated_at,
            })
        return out