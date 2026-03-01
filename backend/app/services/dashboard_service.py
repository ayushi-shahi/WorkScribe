"""Dashboard service — activity feed and summary stats."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.activity_log import ActivityLog
from app.models.notification import Notification
from app.models.project import Project
from app.models.sprint import Sprint, SprintStatus
from app.models.task import Task
from app.models.task_status import StatusCategory, TaskStatus
from app.models.user import User
from app.models.wiki import Page, WikiSpace
from app.schemas.dashboard import (
    ActiveSprintSummary,
    ActivityActorRead,
    ActivityEntryRead,
    ActivityTaskRead,
    DashboardResponse,
    RecentPageRead,
)


class DashboardService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── Activity feed ────────────────────────────────────────────────────────

    async def get_activity_feed(
        self,
        org_id: UUID,
        limit: int = 50,
        skip: int = 0,
    ) -> tuple[list[ActivityEntryRead], int]:
        """Return the last N activity_log entries for the org, newest first."""

        count_stmt = (
            select(func.count())
            .select_from(ActivityLog)
            .where(ActivityLog.org_id == org_id)
        )
        total: int = (await self.db.execute(count_stmt)).scalar_one()

        stmt = (
            select(ActivityLog)
            .where(ActivityLog.org_id == org_id)
            .options(selectinload(ActivityLog.actor))
            .options(
                selectinload(ActivityLog.task).selectinload(Task.project)
            )
            .order_by(ActivityLog.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        rows = (await self.db.execute(stmt)).scalars().all()

        entries: list[ActivityEntryRead] = []
        for row in rows:
            actor = ActivityActorRead(
                id=row.actor.id,
                display_name=row.actor.display_name,
                avatar_url=row.actor.avatar_url,
            )

            task_summary: ActivityTaskRead | None = None
            if row.task is not None:
                task_summary = ActivityTaskRead(
                    id=row.task.id,
                    title=row.task.title,
                    number=row.task.number,
                    project_key=row.task.project.key,
                )

            entries.append(
                ActivityEntryRead(
                    id=row.id,
                    action=row.action,
                    entity_type=row.entity_type,
                    entity_id=row.entity_id,
                    old_value=row.old_value,
                    new_value=row.new_value,
                    created_at=row.created_at,
                    actor=actor,
                    task=task_summary,
                )
            )

        return entries, total

    # ── Dashboard summary ────────────────────────────────────────────────────

    async def get_dashboard_summary(
        self,
        org_id: UUID,
        user_id: UUID,
    ) -> DashboardResponse:
        """Aggregate summary stats for the org dashboard."""

        open_tasks_count = await self._count_open_tasks(org_id)
        active_sprints = await self._get_active_sprints(org_id)
        recent_pages = await self._get_recent_pages(org_id)
        unread_count = await self._count_unread_notifications(org_id, user_id)

        return DashboardResponse(
            open_tasks_count=open_tasks_count,
            active_sprints_count=len(active_sprints),
            unread_notifications_count=unread_count,
            active_sprints=active_sprints,
            recent_pages=recent_pages,
        )

    # ── Private helpers ──────────────────────────────────────────────────────

    async def _count_open_tasks(self, org_id: UUID) -> int:
        """Count tasks whose status category is not done, excluding archived projects."""
        stmt = (
            select(func.count())
            .select_from(Task)
            .join(TaskStatus, Task.status_id == TaskStatus.id)
            .join(Project, Task.project_id == Project.id)
            .where(
                Task.org_id == org_id,
                TaskStatus.category != StatusCategory.done,
                Project.is_archived.is_(False),
                Task.parent_task_id.is_(None),
            )
        )
        return (await self.db.execute(stmt)).scalar_one()

    async def _get_active_sprints(
        self, org_id: UUID
    ) -> list[ActiveSprintSummary]:
        """Return all active sprints with task progress counts."""
        stmt = (
            select(Sprint)
            .join(Project, Sprint.project_id == Project.id)
            .where(
                Sprint.org_id == org_id,
                Sprint.status == SprintStatus.active,
                Project.is_archived.is_(False),
            )
            .options(selectinload(Sprint.project))
            .order_by(Sprint.created_at.desc())
        )
        sprints = (await self.db.execute(stmt)).scalars().all()

        summaries: list[ActiveSprintSummary] = []
        for sprint in sprints:
            total, done = await self._sprint_task_counts(sprint.id, org_id)
            summaries.append(
                ActiveSprintSummary(
                    id=sprint.id,
                    name=sprint.name,
                    project_id=sprint.project_id,
                    project_name=sprint.project.name,
                    project_key=sprint.project.key,
                    total_tasks=total,
                    done_tasks=done,
                )
            )
        return summaries

    async def _sprint_task_counts(
        self, sprint_id: UUID, org_id: UUID
    ) -> tuple[int, int]:
        """Return (total, done) task counts for a sprint."""
        total_stmt = (
            select(func.count())
            .select_from(Task)
            .where(
                Task.sprint_id == sprint_id,
                Task.org_id == org_id,
            )
        )
        done_stmt = (
            select(func.count())
            .select_from(Task)
            .join(TaskStatus, Task.status_id == TaskStatus.id)
            .where(
                Task.sprint_id == sprint_id,
                Task.org_id == org_id,
                TaskStatus.category == StatusCategory.done,
            )
        )
        total: int = (await self.db.execute(total_stmt)).scalar_one()
        done: int = (await self.db.execute(done_stmt)).scalar_one()
        return total, done

    async def _get_recent_pages(
        self, org_id: UUID, limit: int = 5
    ) -> list[RecentPageRead]:
        """Return the 5 most recently updated non-deleted pages."""
        stmt = (
            select(Page)
            .join(WikiSpace, Page.space_id == WikiSpace.id)
            .where(
                Page.org_id == org_id,
                Page.is_deleted.is_(False),
            )
            .options(selectinload(Page.space))
            .order_by(Page.updated_at.desc())
            .limit(limit)
        )
        pages = (await self.db.execute(stmt)).scalars().all()

        return [
            RecentPageRead(
                id=page.id,
                title=page.title,
                space_id=page.space_id,
                space_name=page.space.name,
                updated_at=page.updated_at,
            )
            for page in pages
        ]

    async def _count_unread_notifications(
        self, org_id: UUID, user_id: UUID
    ) -> int:
        stmt = (
            select(func.count())
            .select_from(Notification)
            .where(
                Notification.org_id == org_id,
                Notification.user_id == user_id,
                Notification.is_read.is_(False),
            )
        )
        return (await self.db.execute(stmt)).scalar_one()