"""
Task management endpoints.

CRUD operations for tasks, comments, and activity log.
"""

from __future__ import annotations

from uuid import UUID

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_org_member, get_redis, require_role
from app.models.member import OrgMember, OrgRole
from app.models.organization import Organization
from app.models.user import User
from app.schemas.task import (
    ActivityListResponse,
    BulkPositionRequest,
    CommentCreateRequest,
    CommentListResponse,
    CommentResponse,
    CommentUpdateRequest,
    TaskCreateRequest,
    TaskDetailResponse,
    TaskListResponse,
    TaskMoveRequest,
    TaskUpdateRequest,
)
from app.services.task_service import TaskService

router = APIRouter()


def get_task_service(
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> TaskService:
    return TaskService(db=db, redis=redis)


# ---------------------------------------------------------------------------
# List Tasks
# ---------------------------------------------------------------------------

@router.get(
    "/organizations/{slug}/projects/{project_id}/tasks",
    response_model=TaskListResponse,
    summary="List tasks in a project",
)
async def list_tasks(
    project_id: UUID,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
    status_id: UUID | None = Query(default=None),
    assignee_id: UUID | None = Query(default=None),
    priority: str | None = Query(default=None, pattern="^(urgent|high|medium|low|none)$"),
    type: str | None = Query(default=None, pattern="^(story|bug|task|subtask)$"),
    sprint_id: UUID | None = Query(default=None),
    search: str | None = Query(default=None, max_length=200),
    org_and_member: tuple[Organization, OrgMember] = Depends(get_org_member),
    service: TaskService = Depends(get_task_service),
) -> TaskListResponse:
    org, _ = org_and_member
    return await service.list_tasks(
        project_id=project_id,
        org_id=org.id,
        skip=skip,
        limit=limit,
        status_id=status_id,
        assignee_id=assignee_id,
        priority=priority,
        type=type,
        sprint_id=sprint_id,
        search=search,
    )


# ---------------------------------------------------------------------------
# Create Task
# ---------------------------------------------------------------------------

@router.post(
    "/organizations/{slug}/projects/{project_id}/tasks",
    response_model=TaskDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new task",
)
async def create_task(
    project_id: UUID,
    data: TaskCreateRequest,
    org_and_member: tuple[Organization, OrgMember] = Depends(get_org_member),
    current_user: User = Depends(get_current_user),
    service: TaskService = Depends(get_task_service),
) -> TaskDetailResponse:
    org, _ = org_and_member
    return await service.create_task(
        project_id=project_id,
        org_id=org.id,
        data=data,
        reporter=current_user,
    )


# ---------------------------------------------------------------------------
# Get Task Detail
# ---------------------------------------------------------------------------

@router.get(
    "/tasks/{task_id}",
    response_model=TaskDetailResponse,
    summary="Get task detail",
)
async def get_task(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    service: TaskService = Depends(get_task_service),
) -> TaskDetailResponse:
    """
    Get task detail by ID.

    Org scoping is enforced inside the service by verifying the task's
    org_id matches an org the current user belongs to.
    """
    from sqlalchemy import select
    from app.models.member import OrgMember as _OrgMember

    # Resolve org_id from task's org — verify user is a member
    from app.models.task import Task as _Task
    task_result = await db.execute(
        select(_Task).where(_Task.id == task_id)
    )
    task = task_result.scalar_one_or_none()
    if task is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail={"code": "TASK_NOT_FOUND", "message": "Task not found"})

    member_result = await db.execute(
        select(_OrgMember).where(
            _OrgMember.org_id == task.org_id,
            _OrgMember.user_id == current_user.id,
        )
    )
    if member_result.scalar_one_or_none() is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Access denied"})

    return await service.get_task(task_id, task.org_id)


# ---------------------------------------------------------------------------
# Update Task
# ---------------------------------------------------------------------------

@router.patch(
    "/tasks/{task_id}",
    response_model=TaskDetailResponse,
    summary="Update a task",
)
async def update_task(
    task_id: UUID,
    data: TaskUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    service: TaskService = Depends(get_task_service),
) -> TaskDetailResponse:
    from sqlalchemy import select
    from app.models.member import OrgMember as _OrgMember
    from app.models.task import Task as _Task

    task_result = await db.execute(select(_Task).where(_Task.id == task_id))
    task = task_result.scalar_one_or_none()
    if task is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail={"code": "TASK_NOT_FOUND", "message": "Task not found"})

    member_result = await db.execute(
        select(_OrgMember).where(
            _OrgMember.org_id == task.org_id,
            _OrgMember.user_id == current_user.id,
        )
    )
    if member_result.scalar_one_or_none() is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Access denied"})

    return await service.update_task(task_id, task.org_id, data, current_user)


# ---------------------------------------------------------------------------
# Delete Task
# ---------------------------------------------------------------------------

@router.delete(
    "/tasks/{task_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a task",
)
async def delete_task(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    service: TaskService = Depends(get_task_service),
) -> dict:
    from sqlalchemy import select
    from app.models.member import OrgMember as _OrgMember
    from app.models.task import Task as _Task

    task_result = await db.execute(select(_Task).where(_Task.id == task_id))
    task = task_result.scalar_one_or_none()
    if task is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail={"code": "TASK_NOT_FOUND", "message": "Task not found"})

    member_result = await db.execute(
        select(_OrgMember).where(
            _OrgMember.org_id == task.org_id,
            _OrgMember.user_id == current_user.id,
        )
    )
    member = member_result.scalar_one_or_none()
    if member is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Access denied"})

    is_admin = member.role in (OrgRole.owner, OrgRole.admin)
    await service.delete_task(task_id, task.org_id, current_user, is_admin=is_admin)
    return {}


# ---------------------------------------------------------------------------
# Move Task (board drag)
# ---------------------------------------------------------------------------

@router.patch(
    "/tasks/{task_id}/move",
    response_model=TaskDetailResponse,
    summary="Move task to a different status/position",
)
async def move_task(
    task_id: UUID,
    data: TaskMoveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    service: TaskService = Depends(get_task_service),
) -> TaskDetailResponse:
    from sqlalchemy import select
    from app.models.member import OrgMember as _OrgMember
    from app.models.task import Task as _Task

    task_result = await db.execute(select(_Task).where(_Task.id == task_id))
    task = task_result.scalar_one_or_none()
    if task is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail={"code": "TASK_NOT_FOUND", "message": "Task not found"})

    member_result = await db.execute(
        select(_OrgMember).where(
            _OrgMember.org_id == task.org_id,
            _OrgMember.user_id == current_user.id,
        )
    )
    if member_result.scalar_one_or_none() is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Access denied"})

    return await service.move_task(task_id, task.org_id, data, current_user)


# ---------------------------------------------------------------------------
# Bulk Position Update
# ---------------------------------------------------------------------------

@router.patch(
    "/tasks/bulk-positions",
    status_code=status.HTTP_200_OK,
    summary="Batch update task positions",
)
async def bulk_update_positions(
    data: BulkPositionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    service: TaskService = Depends(get_task_service),
) -> dict:
    from sqlalchemy import select
    from app.models.member import OrgMember as _OrgMember
    from app.models.task import Task as _Task

    # Resolve org_id from first task
    first_task_result = await db.execute(
        select(_Task).where(_Task.id == data.positions[0].task_id)
    )
    first_task = first_task_result.scalar_one_or_none()
    if first_task is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail={"code": "TASK_NOT_FOUND", "message": "Task not found"})

    member_result = await db.execute(
        select(_OrgMember).where(
            _OrgMember.org_id == first_task.org_id,
            _OrgMember.user_id == current_user.id,
        )
    )
    if member_result.scalar_one_or_none() is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Access denied"})

    await service.bulk_update_positions(first_task.org_id, data)
    return {}


# ---------------------------------------------------------------------------
# List Comments
# ---------------------------------------------------------------------------

@router.get(
    "/tasks/{task_id}/comments",
    response_model=CommentListResponse,
    summary="List comments on a task",
)
async def list_comments(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    service: TaskService = Depends(get_task_service),
) -> CommentListResponse:
    from sqlalchemy import select
    from app.models.member import OrgMember as _OrgMember
    from app.models.task import Task as _Task

    task_result = await db.execute(select(_Task).where(_Task.id == task_id))
    task = task_result.scalar_one_or_none()
    if task is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail={"code": "TASK_NOT_FOUND", "message": "Task not found"})

    member_result = await db.execute(
        select(_OrgMember).where(
            _OrgMember.org_id == task.org_id,
            _OrgMember.user_id == current_user.id,
        )
    )
    if member_result.scalar_one_or_none() is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Access denied"})

    return await service.list_comments(task_id, task.org_id)


# ---------------------------------------------------------------------------
# Create Comment
# ---------------------------------------------------------------------------

@router.post(
    "/tasks/{task_id}/comments",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a comment to a task",
)
async def create_comment(
    task_id: UUID,
    data: CommentCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    service: TaskService = Depends(get_task_service),
) -> CommentResponse:
    from sqlalchemy import select
    from app.models.member import OrgMember as _OrgMember
    from app.models.task import Task as _Task

    task_result = await db.execute(select(_Task).where(_Task.id == task_id))
    task = task_result.scalar_one_or_none()
    if task is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail={"code": "TASK_NOT_FOUND", "message": "Task not found"})

    member_result = await db.execute(
        select(_OrgMember).where(
            _OrgMember.org_id == task.org_id,
            _OrgMember.user_id == current_user.id,
        )
    )
    if member_result.scalar_one_or_none() is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Access denied"})

    return await service.create_comment(task_id, task.org_id, data, current_user)


# ---------------------------------------------------------------------------
# Update Comment
# ---------------------------------------------------------------------------

@router.patch(
    "/tasks/{task_id}/comments/{comment_id}",
    response_model=CommentResponse,
    summary="Edit a comment",
)
async def update_comment(
    task_id: UUID,
    comment_id: UUID,
    data: CommentUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    service: TaskService = Depends(get_task_service),
) -> CommentResponse:
    from sqlalchemy import select
    from app.models.member import OrgMember as _OrgMember
    from app.models.task import Task as _Task

    task_result = await db.execute(select(_Task).where(_Task.id == task_id))
    task = task_result.scalar_one_or_none()
    if task is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail={"code": "TASK_NOT_FOUND", "message": "Task not found"})

    member_result = await db.execute(
        select(_OrgMember).where(
            _OrgMember.org_id == task.org_id,
            _OrgMember.user_id == current_user.id,
        )
    )
    member = member_result.scalar_one_or_none()
    if member is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Access denied"})

    is_admin = member.role in (OrgRole.owner, OrgRole.admin)
    return await service.update_comment(comment_id, task.org_id, data, current_user, is_admin=is_admin)


# ---------------------------------------------------------------------------
# Delete Comment
# ---------------------------------------------------------------------------

@router.delete(
    "/tasks/{task_id}/comments/{comment_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a comment",
)
async def delete_comment(
    task_id: UUID,
    comment_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    service: TaskService = Depends(get_task_service),
) -> dict:
    from sqlalchemy import select
    from app.models.member import OrgMember as _OrgMember
    from app.models.task import Task as _Task

    task_result = await db.execute(select(_Task).where(_Task.id == task_id))
    task = task_result.scalar_one_or_none()
    if task is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail={"code": "TASK_NOT_FOUND", "message": "Task not found"})

    member_result = await db.execute(
        select(_OrgMember).where(
            _OrgMember.org_id == task.org_id,
            _OrgMember.user_id == current_user.id,
        )
    )
    member = member_result.scalar_one_or_none()
    if member is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Access denied"})

    is_admin = member.role in (OrgRole.owner, OrgRole.admin)
    await service.delete_comment(comment_id, task.org_id, current_user, is_admin=is_admin)
    return {}


# ---------------------------------------------------------------------------
# Activity Log
# ---------------------------------------------------------------------------

@router.get(
    "/tasks/{task_id}/activity",
    response_model=ActivityListResponse,
    summary="Get activity log for a task",
)
async def list_activity(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
    service: TaskService = Depends(get_task_service),
) -> ActivityListResponse:
    from sqlalchemy import select
    from app.models.member import OrgMember as _OrgMember
    from app.models.task import Task as _Task

    task_result = await db.execute(select(_Task).where(_Task.id == task_id))
    task = task_result.scalar_one_or_none()
    if task is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail={"code": "TASK_NOT_FOUND", "message": "Task not found"})

    member_result = await db.execute(
        select(_OrgMember).where(
            _OrgMember.org_id == task.org_id,
            _OrgMember.user_id == current_user.id,
        )
    )
    if member_result.scalar_one_or_none() is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Access denied"})

    return await service.list_activity(task_id, task.org_id)