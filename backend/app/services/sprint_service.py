"""
Sprint business logic.

Handles sprint lifecycle: create, update, start, complete.
All queries scoped by org_id.
"""

from __future__ import annotations

from uuid import UUID

import redis.asyncio as aioredis
from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member import OrgMember, OrgRole
from app.models.sprint import Sprint, SprintStatus
from app.models.task import Task
from app.models.task_status import StatusCategory, TaskStatus
from app.models.user import User
from app.schemas.sprint import (
    SprintCompleteRequest,
    SprintCreateRequest,
    SprintListResponse,
    SprintResponse,
    SprintUpdateRequest,
)


class SprintService:
    """Handles all sprint operations."""

    def __init__(self, db: AsyncSession, redis: aioredis.Redis) -> None:
        self.db = db
        self.redis = redis

    # -----------------------------------------------------------------------
    # List Sprints
    # -----------------------------------------------------------------------

    async def list_sprints(
        self, project_id: UUID, org_id: UUID
    ) -> SprintListResponse:
        """List all sprints for a project with task counts."""
        result = await self.db.execute(
            select(Sprint)
            .where(Sprint.project_id == project_id, Sprint.org_id == org_id)
            .order_by(Sprint.created_at)
        )
        sprints = list(result.scalars().all())

        items = []
        for sprint in sprints:
            task_count, completed_count = await self._get_sprint_task_counts(
                sprint.id, org_id
            )
            items.append(
                SprintResponse(
                    id=sprint.id,
                    org_id=sprint.org_id,
                    project_id=sprint.project_id,
                    name=sprint.name,
                    goal=sprint.goal,
                    status=sprint.status.value,
                    start_date=sprint.start_date,
                    end_date=sprint.end_date,
                    created_at=sprint.created_at,
                    updated_at=sprint.updated_at,
                    task_count=task_count,
                    completed_task_count=completed_count,
                )
            )

        return SprintListResponse(sprints=items, total=len(items))

    # -----------------------------------------------------------------------
    # Create Sprint
    # -----------------------------------------------------------------------

    async def create_sprint(
        self, project_id: UUID, org_id: UUID, data: SprintCreateRequest
    ) -> SprintResponse:
        """Create a new sprint in planned status."""
        sprint = Sprint(
            org_id=org_id,
            project_id=project_id,
            name=data.name,
            goal=data.goal,
            start_date=data.start_date,
            end_date=data.end_date,
            status=SprintStatus.planned,
        )
        self.db.add(sprint)
        await self.db.flush()
        await self.db.refresh(sprint)

        return SprintResponse(
            id=sprint.id,
            org_id=sprint.org_id,
            project_id=sprint.project_id,
            name=sprint.name,
            goal=sprint.goal,
            status=sprint.status.value,
            start_date=sprint.start_date,
            end_date=sprint.end_date,
            created_at=sprint.created_at,
            updated_at=sprint.updated_at,
            task_count=0,
            completed_task_count=0,
        )

    # -----------------------------------------------------------------------
    # Update Sprint
    # -----------------------------------------------------------------------

    async def update_sprint(
        self, sprint_id: UUID, user: User, data: SprintUpdateRequest
    ) -> SprintResponse:
        """Update sprint name, goal, or dates."""
        sprint, org_id = await self._get_sprint_for_user(sprint_id, user, require_admin=True)

        if data.name is not None:
            sprint.name = data.name
        if data.goal is not None:
            sprint.goal = data.goal
        if data.start_date is not None:
            sprint.start_date = data.start_date
        if data.end_date is not None:
            sprint.end_date = data.end_date

        await self.db.flush()
        await self.db.refresh(sprint)

        task_count, completed_count = await self._get_sprint_task_counts(
            sprint.id, org_id
        )

        return SprintResponse(
            id=sprint.id,
            org_id=sprint.org_id,
            project_id=sprint.project_id,
            name=sprint.name,
            goal=sprint.goal,
            status=sprint.status.value,
            start_date=sprint.start_date,
            end_date=sprint.end_date,
            created_at=sprint.created_at,
            updated_at=sprint.updated_at,
            task_count=task_count,
            completed_task_count=completed_count,
        )

    # -----------------------------------------------------------------------
    # Start Sprint
    # -----------------------------------------------------------------------

    async def start_sprint(self, sprint_id: UUID, user: User) -> SprintResponse:
        """Start a sprint. Enforces only one active sprint per project."""
        sprint, org_id = await self._get_sprint_for_user(sprint_id, user, require_admin=True)

        if sprint.status != SprintStatus.planned:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "INVALID_STATUS", "message": "Only planned sprints can be started"},
            )

        active_result = await self.db.execute(
            select(Sprint).where(
                Sprint.project_id == sprint.project_id,
                Sprint.org_id == org_id,
                Sprint.status == SprintStatus.active,
            )
        )
        if active_result.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "ACTIVE_SPRINT_EXISTS", "message": "A sprint is already active for this project"},
            )

        sprint.status = SprintStatus.active
        await self.db.flush()
        await self.db.refresh(sprint)

        task_count, completed_count = await self._get_sprint_task_counts(sprint.id, org_id)

        return SprintResponse(
            id=sprint.id,
            org_id=sprint.org_id,
            project_id=sprint.project_id,
            name=sprint.name,
            goal=sprint.goal,
            status=sprint.status.value,
            start_date=sprint.start_date,
            end_date=sprint.end_date,
            created_at=sprint.created_at,
            updated_at=sprint.updated_at,
            task_count=task_count,
            completed_task_count=completed_count,
        )

    # -----------------------------------------------------------------------
    # Complete Sprint
    # -----------------------------------------------------------------------

    async def complete_sprint(
        self, sprint_id: UUID, user: User, data: SprintCompleteRequest
    ) -> SprintResponse:
        """Complete a sprint, moving incomplete tasks to backlog or another sprint."""
        sprint, org_id = await self._get_sprint_for_user(sprint_id, user, require_admin=True)

        if sprint.status != SprintStatus.active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "INVALID_STATUS", "message": "Only active sprints can be completed"},
            )

        done_statuses_result = await self.db.execute(
            select(TaskStatus.id).where(
                TaskStatus.project_id == sprint.project_id,
                TaskStatus.org_id == org_id,
                TaskStatus.category == StatusCategory.done,
            )
        )
        done_status_ids = [row[0] for row in done_statuses_result.all()]

        incomplete_tasks_result = await self.db.execute(
            select(Task).where(
                Task.sprint_id == sprint_id,
                Task.org_id == org_id,
                Task.status_id.not_in(done_status_ids),
            )
        )
        incomplete_tasks = list(incomplete_tasks_result.scalars().all())

        if data.incomplete_action == "backlog":
            for task in incomplete_tasks:
                task.sprint_id = None
        elif data.incomplete_action == "sprint":
            if data.target_sprint_id is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"code": "TARGET_SPRINT_REQUIRED", "message": "target_sprint_id is required when incomplete_action is 'sprint'"},
                )
            target_result = await self.db.execute(
                select(Sprint).where(
                    Sprint.id == data.target_sprint_id,
                    Sprint.project_id == sprint.project_id,
                    Sprint.org_id == org_id,
                )
            )
            target_sprint = target_result.scalar_one_or_none()
            if target_sprint is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail={"code": "SPRINT_NOT_FOUND", "message": "Target sprint not found"},
                )
            for task in incomplete_tasks:
                task.sprint_id = data.target_sprint_id

        sprint.status = SprintStatus.completed
        await self.db.flush()
        await self.db.refresh(sprint)

        task_count, completed_count = await self._get_sprint_task_counts(sprint.id, org_id)

        return SprintResponse(
            id=sprint.id,
            org_id=sprint.org_id,
            project_id=sprint.project_id,
            name=sprint.name,
            goal=sprint.goal,
            status=sprint.status.value,
            start_date=sprint.start_date,
            end_date=sprint.end_date,
            created_at=sprint.created_at,
            updated_at=sprint.updated_at,
            task_count=task_count,
            completed_task_count=completed_count,
        )

    # -----------------------------------------------------------------------
    # Delete Sprint
    # -----------------------------------------------------------------------

    async def delete_sprint(self, sprint_id: UUID, user: User) -> None:
        """Delete a planned sprint only."""
        sprint, org_id = await self._get_sprint_for_user(sprint_id, user, require_admin=True)

        if sprint.status != SprintStatus.planned:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "INVALID_STATUS", "message": "Only planned sprints can be deleted"},
            )

        await self.db.execute(
            update(Task)
            .where(Task.sprint_id == sprint_id, Task.org_id == org_id)
            .values(sprint_id=None)
        )

        await self.db.delete(sprint)
        await self.db.flush()

    # -----------------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------------

    async def _get_sprint_for_user(
        self, sprint_id: UUID, user: User, require_admin: bool = False
    ) -> tuple[Sprint, UUID]:
        """
        Load sprint and verify user is a member of its org.
        Returns (sprint, org_id).
        """
        result = await self.db.execute(
            select(Sprint).where(Sprint.id == sprint_id)
        )
        sprint = result.scalar_one_or_none()
        if sprint is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "SPRINT_NOT_FOUND", "message": "Sprint not found"},
            )

        # Verify user membership
        member_result = await self.db.execute(
            select(OrgMember).where(
                OrgMember.org_id == sprint.org_id,
                OrgMember.user_id == user.id,
            )
        )
        member = member_result.scalar_one_or_none()
        if member is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "SPRINT_NOT_FOUND", "message": "Sprint not found"},
            )

        if require_admin and member.role not in (OrgRole.owner, OrgRole.admin):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "FORBIDDEN", "message": "Owner or Admin role required"},
            )

        return sprint, sprint.org_id

    async def _get_sprint(self, sprint_id: UUID, org_id: UUID) -> Sprint:
        result = await self.db.execute(
            select(Sprint).where(
                Sprint.id == sprint_id,
                Sprint.org_id == org_id,
            )
        )
        sprint = result.scalar_one_or_none()
        if sprint is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "SPRINT_NOT_FOUND", "message": "Sprint not found"},
            )
        return sprint

    async def _get_sprint_task_counts(
        self, sprint_id: UUID, org_id: UUID
    ) -> tuple[int, int]:
        """Return (total_tasks, completed_tasks) for a sprint."""
        total_result = await self.db.execute(
            select(func.count(Task.id)).where(
                Task.sprint_id == sprint_id,
                Task.org_id == org_id,
            )
        )
        total = total_result.scalar_one()

        done_statuses_result = await self.db.execute(
            select(TaskStatus.id)
            .join(Task, TaskStatus.id == Task.status_id)
            .where(
                Task.sprint_id == sprint_id,
                Task.org_id == org_id,
                TaskStatus.category == StatusCategory.done,
            )
        )
        done_ids = [row[0] for row in done_statuses_result.all()]

        completed_result = await self.db.execute(
            select(func.count(Task.id)).where(
                Task.sprint_id == sprint_id,
                Task.org_id == org_id,
                Task.status_id.in_(done_ids) if done_ids else Task.id.is_(None),
            )
        )
        completed = completed_result.scalar_one()

        return total, completed