"""
Task business logic.

Handles task CRUD, comments, activity logging, label management.
All queries scoped by org_id.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

import redis.asyncio as aioredis
from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog
from app.models.comment import Comment
from app.models.label import Label, TaskLabel
from app.models.project import Project
from app.models.task import Task, TaskPriority, TaskType
from app.models.task_status import TaskStatus, StatusCategory
from app.models.user import User
from app.schemas.task import (
    ActivityListResponse,
    ActivityResponse,
    BulkPositionRequest,
    CommentCreateRequest,
    CommentListResponse,
    CommentResponse,
    CommentUpdateRequest,
    LabelResponse,
    TaskCreateRequest,
    TaskDetailResponse,
    TaskListItem,
    TaskListResponse,
    TaskMoveRequest,
    TaskUpdateRequest,
    UserSummaryResponse,
)


def _queue_notification(
    org_id: UUID,
    user_id: UUID,
    notification_type: str,
    title: str,
    body: str | None,
    entity_type: str,
    entity_id: UUID,
) -> None:
    """
    Fire-and-forget: enqueue a Celery notification task.
    Import is deferred to avoid circular imports at module load.
    """
    from app.workers.notification_tasks import dispatch_notification
    dispatch_notification.delay(
        org_id=str(org_id),
        user_id=str(user_id),
        notification_type=notification_type,
        title=title,
        body=body,
        entity_type=entity_type,
        entity_id=str(entity_id),
    )


def _extract_mention_user_ids(body_json: dict[str, Any]) -> list[str]:
    """
    Recursively walk a Tiptap/ProseMirror JSON document and collect
    all user IDs referenced by mention nodes.

    Mention node structure:
    {
        "type": "mention",
        "attrs": {"id": "<user_id>", "label": "Display Name"}
    }
    """
    user_ids: list[str] = []

    def walk(node: Any) -> None:
        if not isinstance(node, dict):
            return
        if node.get("type") == "mention":
            attrs = node.get("attrs", {})
            uid = attrs.get("id")
            if uid:
                user_ids.append(uid)
        for child in node.get("content", []):
            walk(child)

    walk(body_json)
    return user_ids


class TaskService:
    """Handles all task operations."""

    def __init__(self, db: AsyncSession, redis: aioredis.Redis) -> None:
        self.db = db
        self.redis = redis

    # -----------------------------------------------------------------------
    # List Tasks
    # -----------------------------------------------------------------------

    async def list_tasks(
        self,
        project_id: UUID,
        org_id: UUID,
        skip: int = 0,
        limit: int = 25,
        status_id: UUID | None = None,
        assignee_id: UUID | None = None,
        priority: str | None = None,
        type: str | None = None,
        sprint_id: UUID | None = None,
        search: str | None = None,
    ) -> TaskListResponse:
        """List tasks for a project with optional filters. Scoped by org_id."""

        await self._get_project(project_id, org_id)

        stmt = (
            select(Task)
            .where(Task.project_id == project_id, Task.org_id == org_id)
        )

        if status_id is not None:
            stmt = stmt.where(Task.status_id == status_id)
        if assignee_id is not None:
            stmt = stmt.where(Task.assignee_id == assignee_id)
        if priority is not None:
            stmt = stmt.where(Task.priority == TaskPriority(priority))
        if type is not None:
            stmt = stmt.where(Task.type == TaskType(type))
        if sprint_id is not None:
            stmt = stmt.where(Task.sprint_id == sprint_id)
        if search is not None:
            stmt = stmt.where(Task.title.ilike(f"%{search}%"))

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.db.execute(count_stmt)).scalar_one()

        stmt = stmt.order_by(Task.position, Task.created_at).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        tasks = list(result.scalars().all())

        task_ids = [t.id for t in tasks]
        labels_by_task = await self._load_labels_for_tasks(task_ids)

        items = [
            TaskListItem(
                id=t.id,
                org_id=t.org_id,
                project_id=t.project_id,
                number=t.number,
                title=t.title,
                status_id=t.status_id,
                assignee_id=t.assignee_id,
                reporter_id=t.reporter_id,
                priority=t.priority.value,
                type=t.type.value,
                parent_task_id=t.parent_task_id,
                sprint_id=t.sprint_id,
                position=t.position,
                due_date=t.due_date,
                created_at=t.created_at,
                updated_at=t.updated_at,
                labels=labels_by_task.get(t.id, []),
            )
            for t in tasks
        ]

        return TaskListResponse(tasks=items, total=total, skip=skip, limit=limit)

    # -----------------------------------------------------------------------
    # Create Task
    # -----------------------------------------------------------------------

    async def create_task(
        self,
        project_id: UUID,
        org_id: UUID,
        data: TaskCreateRequest,
        reporter: User,
    ) -> TaskDetailResponse:
        """
        Create a new task.

        Uses SELECT ... FOR UPDATE on project_task_counters to safely
        increment the task number without race conditions.

        Dispatches TASK_ASSIGNED notification if assignee_id is set.
        """
        project = await self._get_project(project_id, org_id)
        await self._get_status(data.status_id, project_id, org_id)

        if data.assignee_id is not None:
            await self._verify_user_in_org(data.assignee_id, org_id)

        from sqlalchemy import text
        counter_result = await self.db.execute(
            text(
                "SELECT last_number FROM project_task_counters "
                "WHERE project_id = :project_id FOR UPDATE"
            ),
            {"project_id": str(project_id)},
        )
        row = counter_result.fetchone()

        if row is None:
            await self.db.execute(
                text(
                    "INSERT INTO project_task_counters (project_id, last_number) "
                    "VALUES (:project_id, 0)"
                ),
                {"project_id": str(project_id)},
            )
            next_number = 1
        else:
            next_number = row[0] + 1

        await self.db.execute(
            text(
                "UPDATE project_task_counters SET last_number = :n "
                "WHERE project_id = :project_id"
            ),
            {"n": next_number, "project_id": str(project_id)},
        )

        max_pos_result = await self.db.execute(
            select(func.max(Task.position)).where(
                Task.project_id == project_id,
                Task.status_id == data.status_id,
            )
        )
        max_pos = max_pos_result.scalar() or 0
        position = max_pos + 1000

        task = Task(
            org_id=org_id,
            project_id=project_id,
            number=next_number,
            title=data.title,
            description_json=data.description_json,
            status_id=data.status_id,
            assignee_id=data.assignee_id,
            reporter_id=reporter.id,
            priority=TaskPriority(data.priority),
            type=TaskType(data.type),
            parent_task_id=data.parent_task_id,
            sprint_id=data.sprint_id,
            due_date=data.due_date,
            position=position,
        )
        self.db.add(task)
        await self.db.flush()

        if data.label_ids:
            await self._set_task_labels(task.id, data.label_ids, project_id, org_id)

        await self._log_activity(
            org_id=org_id,
            task_id=task.id,
            actor_id=reporter.id,
            action="TASK_CREATED",
            entity_type="task",
            entity_id=task.id,
            new_value={"title": task.title, "number": task.number},
        )

        await self.db.flush()

        # Notify assignee if assigned at creation (and not assigning to self)
        if data.assignee_id is not None and data.assignee_id != reporter.id:
            _queue_notification(
                org_id=org_id,
                user_id=data.assignee_id,
                notification_type="TASK_ASSIGNED",
                title=f"You were assigned {project.key}-{next_number}",
                body=data.title,
                entity_type="task",
                entity_id=task.id,
            )

        return await self.get_task(task.id, org_id)

    # -----------------------------------------------------------------------
    # Get Task Detail
    # -----------------------------------------------------------------------

    async def get_task(self, task_id: UUID, org_id: UUID) -> TaskDetailResponse:
        """Get full task detail. Scoped by org_id."""
        task = await self._get_task(task_id, org_id)

        labels = await self._load_labels_for_tasks([task.id])
        task_labels = labels.get(task.id, [])

        assignee = None
        if task.assignee_id is not None:
            assignee_result = await self.db.execute(
                select(User).where(User.id == task.assignee_id)
            )
            assignee_user = assignee_result.scalar_one_or_none()
            if assignee_user:
                assignee = UserSummaryResponse(
                    id=assignee_user.id,
                    display_name=assignee_user.display_name,
                    avatar_url=assignee_user.avatar_url,
                    email=assignee_user.email,
                )

        reporter_result = await self.db.execute(
            select(User).where(User.id == task.reporter_id)
        )
        reporter_user = reporter_result.scalar_one_or_none()
        reporter = None
        if reporter_user:
            reporter = UserSummaryResponse(
                id=reporter_user.id,
                display_name=reporter_user.display_name,
                avatar_url=reporter_user.avatar_url,
                email=reporter_user.email,
            )

        subtask_count_result = await self.db.execute(
            select(func.count(Task.id)).where(Task.parent_task_id == task.id)
        )
        subtask_count = subtask_count_result.scalar_one()

        comment_count_result = await self.db.execute(
            select(func.count(Comment.id)).where(Comment.task_id == task.id)
        )
        comment_count = comment_count_result.scalar_one()

        return TaskDetailResponse(
            id=task.id,
            org_id=task.org_id,
            project_id=task.project_id,
            number=task.number,
            title=task.title,
            description_json=task.description_json,
            status_id=task.status_id,
            assignee_id=task.assignee_id,
            reporter_id=task.reporter_id,
            priority=task.priority.value,
            type=task.type.value,
            parent_task_id=task.parent_task_id,
            sprint_id=task.sprint_id,
            position=task.position,
            due_date=task.due_date,
            created_at=task.created_at,
            updated_at=task.updated_at,
            labels=task_labels,
            assignee=assignee,
            reporter=reporter,
            subtask_count=subtask_count,
            comment_count=comment_count,
        )

    # -----------------------------------------------------------------------
    # Update Task
    # -----------------------------------------------------------------------

    async def update_task(
        self,
        task_id: UUID,
        org_id: UUID,
        data: TaskUpdateRequest,
        actor: User,
    ) -> TaskDetailResponse:
        """
        Partially update a task.

        Logs every changed field to activity_log with old → new values.
        Dispatches TASK_ASSIGNED on assignee change.
        Dispatches TASK_DONE when status moves to a 'done' category.
        """
        task = await self._get_task(task_id, org_id)
        changes: dict[str, dict[str, Any]] = {}

        # Track old values for notification decisions
        old_assignee_id = task.assignee_id
        old_status_id = task.status_id

        if data.title is not None and data.title != task.title:
            changes["title"] = {"old": task.title, "new": data.title}
            task.title = data.title

        if data.description_json is not None:
            task.description_json = data.description_json

        if data.status_id is not None and data.status_id != task.status_id:
            await self._get_status(data.status_id, task.project_id, org_id)
            changes["status_id"] = {
                "old": str(task.status_id),
                "new": str(data.status_id),
            }
            task.status_id = data.status_id

        if data.assignee_id is not None and data.assignee_id != task.assignee_id:
            await self._verify_user_in_org(data.assignee_id, org_id)
            changes["assignee_id"] = {
                "old": str(task.assignee_id) if task.assignee_id else None,
                "new": str(data.assignee_id),
            }
            task.assignee_id = data.assignee_id
        elif data.assignee_id is None and "assignee_id" in data.model_fields_set:
            changes["assignee_id"] = {
                "old": str(task.assignee_id) if task.assignee_id else None,
                "new": None,
            }
            task.assignee_id = None

        if data.priority is not None and data.priority != task.priority.value:
            changes["priority"] = {"old": task.priority.value, "new": data.priority}
            task.priority = TaskPriority(data.priority)

        if data.type is not None and data.type != task.type.value:
            changes["type"] = {"old": task.type.value, "new": data.type}
            task.type = TaskType(data.type)

        if data.sprint_id != task.sprint_id and "sprint_id" in data.model_fields_set:
            changes["sprint_id"] = {
                "old": str(task.sprint_id) if task.sprint_id else None,
                "new": str(data.sprint_id) if data.sprint_id else None,
            }
            task.sprint_id = data.sprint_id

        if data.due_date != task.due_date and "due_date" in data.model_fields_set:
            changes["due_date"] = {
                "old": str(task.due_date) if task.due_date else None,
                "new": str(data.due_date) if data.due_date else None,
            }
            task.due_date = data.due_date

        if data.parent_task_id != task.parent_task_id and "parent_task_id" in data.model_fields_set:
            task.parent_task_id = data.parent_task_id

        if data.label_ids is not None:
            await self._set_task_labels(task.id, data.label_ids, task.project_id, org_id)

        await self.db.flush()

        for field, vals in changes.items():
            await self._log_activity(
                org_id=org_id,
                task_id=task.id,
                actor_id=actor.id,
                action="FIELD_UPDATED",
                entity_type="task",
                entity_id=task.id,
                old_value={field: vals["old"]},
                new_value={field: vals["new"]},
            )

        await self.db.flush()

        # Notify new assignee (if changed and not assigning to self)
        if (
            data.assignee_id is not None
            and data.assignee_id != old_assignee_id
            and data.assignee_id != actor.id
        ):
            project = await self._get_project(task.project_id, org_id)
            _queue_notification(
                org_id=org_id,
                user_id=data.assignee_id,
                notification_type="TASK_ASSIGNED",
                title=f"You were assigned {project.key}-{task.number}",
                body=task.title,
                entity_type="task",
                entity_id=task.id,
            )

        # Notify reporter when status moves to 'done' category
        # (only if reporter is not the actor making the change)
        if (
            data.status_id is not None
            and data.status_id != old_status_id
            and task.reporter_id != actor.id
        ):
            new_status = await self.db.scalar(
                select(TaskStatus).where(TaskStatus.id == data.status_id)
            )
            if new_status and new_status.category == StatusCategory.done:
                project = await self._get_project(task.project_id, org_id)
                _queue_notification(
                    org_id=org_id,
                    user_id=task.reporter_id,
                    notification_type="TASK_DONE",
                    title=f"{project.key}-{task.number} moved to Done",
                    body=task.title,
                    entity_type="task",
                    entity_id=task.id,
                )

        return await self.get_task(task.id, org_id)

    # -----------------------------------------------------------------------
    # Delete Task
    # -----------------------------------------------------------------------

    async def delete_task(
        self,
        task_id: UUID,
        org_id: UUID,
        actor: User,
        is_admin: bool = False,
    ) -> None:
        """Delete a task. Members can only delete their own tasks."""
        task = await self._get_task(task_id, org_id)

        if not is_admin and task.reporter_id != actor.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "FORBIDDEN", "message": "You can only delete tasks you created"},
            )

        await self.db.delete(task)
        await self.db.flush()

    # -----------------------------------------------------------------------
    # Move Task (board drag)
    # -----------------------------------------------------------------------

    async def move_task(
        self,
        task_id: UUID,
        org_id: UUID,
        data: TaskMoveRequest,
        actor: User,
    ) -> TaskDetailResponse:
        """
        Update task status and position in one call.
        Dispatches TASK_DONE if moved to a done-category status.
        """
        task = await self._get_task(task_id, org_id)
        old_status_id = task.status_id

        new_status = await self._get_status(data.status_id, task.project_id, org_id)
        task.status_id = data.status_id
        task.position = data.position

        await self.db.flush()

        if old_status_id != data.status_id:
            await self._log_activity(
                org_id=org_id,
                task_id=task.id,
                actor_id=actor.id,
                action="FIELD_UPDATED",
                entity_type="task",
                entity_id=task.id,
                old_value={"status_id": str(old_status_id)},
                new_value={"status_id": str(data.status_id)},
            )
            await self.db.flush()

            if task.reporter_id != actor.id:
                await self.db.refresh(new_status)
                if new_status.category == StatusCategory.done:
                    project = await self._get_project(task.project_id, org_id)
                    _queue_notification(
                        org_id=org_id,
                        user_id=task.reporter_id,
                        notification_type="TASK_DONE",
                        title=f"{project.key}-{task.number} moved to Done",
                        body=task.title,
                        entity_type="task",
                        entity_id=task.id,
                    )

        return await self.get_task(task.id, org_id)

    # -----------------------------------------------------------------------
    # Bulk Position Update
    # -----------------------------------------------------------------------

    async def bulk_update_positions(
        self,
        org_id: UUID,
        data: BulkPositionRequest,
    ) -> None:
        """Batch update task positions. All tasks must belong to org."""
        for item in data.positions:
            await self.db.execute(
                update(Task)
                .where(Task.id == item.task_id, Task.org_id == org_id)
                .values(position=item.position)
            )
        await self.db.flush()

    # -----------------------------------------------------------------------
    # Comments
    # -----------------------------------------------------------------------

    async def list_comments(
        self, task_id: UUID, org_id: UUID
    ) -> CommentListResponse:
        """List comments for a task."""
        await self._get_task(task_id, org_id)

        result = await self.db.execute(
            select(Comment)
            .where(Comment.task_id == task_id)
            .order_by(Comment.created_at)
        )
        comments = list(result.scalars().all())

        author_ids = list({c.author_id for c in comments})
        authors: dict[UUID, User] = {}
        if author_ids:
            authors_result = await self.db.execute(
                select(User).where(User.id.in_(author_ids))
            )
            for u in authors_result.scalars().all():
                authors[u.id] = u

        items = [
            CommentResponse(
                id=c.id,
                task_id=c.task_id,
                author_id=c.author_id,
                body_json=c.body_json,
                is_edited=c.is_edited,
                created_at=c.created_at,
                updated_at=c.updated_at,
                author=UserSummaryResponse(
                    id=authors[c.author_id].id,
                    display_name=authors[c.author_id].display_name,
                    avatar_url=authors[c.author_id].avatar_url,
                    email=authors[c.author_id].email,
                ) if c.author_id in authors else None,
            )
            for c in comments
        ]

        return CommentListResponse(comments=items, total=len(items))

    async def create_comment(
        self,
        task_id: UUID,
        org_id: UUID,
        data: CommentCreateRequest,
        author: User,
    ) -> CommentResponse:
        """
        Create a comment on a task.
        Parses @mentions from body_json and dispatches MENTION notifications.
        """
        task = await self._get_task(task_id, org_id)

        comment = Comment(
            task_id=task_id,
            author_id=author.id,
            body_json=data.body_json,
        )
        self.db.add(comment)
        await self.db.flush()

        # Dispatch MENTION notifications for each mentioned user
        mention_user_ids = _extract_mention_user_ids(data.body_json)
        for uid_str in set(mention_user_ids):
            try:
                uid = UUID(uid_str)
            except ValueError:
                continue
            # Don't notify the author if they mention themselves
            if uid == author.id:
                continue
            # Load project key for notification title
            project = await self._get_project(task.project_id, org_id)
            _queue_notification(
                org_id=org_id,
                user_id=uid,
                notification_type="MENTION",
                title=f"{author.display_name} mentioned you in {project.key}-{task.number}",
                body=task.title,
                entity_type="task",
                entity_id=task_id,
            )

        return CommentResponse(
            id=comment.id,
            task_id=comment.task_id,
            author_id=comment.author_id,
            body_json=comment.body_json,
            is_edited=comment.is_edited,
            created_at=comment.created_at,
            updated_at=comment.updated_at,
            author=UserSummaryResponse(
                id=author.id,
                display_name=author.display_name,
                avatar_url=author.avatar_url,
                email=author.email,
            ),
        )

    async def update_comment(
        self,
        comment_id: UUID,
        org_id: UUID,
        data: CommentUpdateRequest,
        actor: User,
        is_admin: bool = False,
    ) -> CommentResponse:
        """Edit a comment. Only author or admin can edit."""
        comment = await self._get_comment(comment_id, org_id)

        if not is_admin and comment.author_id != actor.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "FORBIDDEN", "message": "You can only edit your own comments"},
            )

        comment.body_json = data.body_json
        comment.is_edited = True
        await self.db.flush()

        author_result = await self.db.execute(
            select(User).where(User.id == comment.author_id)
        )
        author = author_result.scalar_one_or_none()

        return CommentResponse(
            id=comment.id,
            task_id=comment.task_id,
            author_id=comment.author_id,
            body_json=comment.body_json,
            is_edited=comment.is_edited,
            created_at=comment.created_at,
            updated_at=comment.updated_at,
            author=UserSummaryResponse(
                id=author.id,
                display_name=author.display_name,
                avatar_url=author.avatar_url,
                email=author.email,
            ) if author else None,
        )

    async def delete_comment(
        self,
        comment_id: UUID,
        org_id: UUID,
        actor: User,
        is_admin: bool = False,
    ) -> None:
        """Delete a comment. Only author or admin can delete."""
        comment = await self._get_comment(comment_id, org_id)

        if not is_admin and comment.author_id != actor.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "FORBIDDEN", "message": "You can only delete your own comments"},
            )

        await self.db.delete(comment)
        await self.db.flush()

    # -----------------------------------------------------------------------
    # Activity Log
    # -----------------------------------------------------------------------

    async def list_activity(
        self, task_id: UUID, org_id: UUID
    ) -> ActivityListResponse:
        """List activity log for a task, reverse chronological."""
        await self._get_task(task_id, org_id)

        result = await self.db.execute(
            select(ActivityLog)
            .where(ActivityLog.task_id == task_id, ActivityLog.org_id == org_id)
            .order_by(ActivityLog.created_at.desc())
        )
        logs = list(result.scalars().all())

        actor_ids = list({log.actor_id for log in logs})
        actors: dict[UUID, User] = {}
        if actor_ids:
            actors_result = await self.db.execute(
                select(User).where(User.id.in_(actor_ids))
            )
            for u in actors_result.scalars().all():
                actors[u.id] = u

        items = [
            ActivityResponse(
                id=log.id,
                org_id=log.org_id,
                task_id=log.task_id,
                actor_id=log.actor_id,
                action=log.action,
                entity_type=log.entity_type,
                entity_id=log.entity_id,
                old_value=log.old_value,
                new_value=log.new_value,
                created_at=log.created_at,
                actor=UserSummaryResponse(
                    id=actors[log.actor_id].id,
                    display_name=actors[log.actor_id].display_name,
                    avatar_url=actors[log.actor_id].avatar_url,
                    email=actors[log.actor_id].email,
                ) if log.actor_id in actors else None,
            )
            for log in logs
        ]

        return ActivityListResponse(activities=items, total=len(items))

    # -----------------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------------

    async def _get_project(self, project_id: UUID, org_id: UUID) -> Project:
        result = await self.db.execute(
            select(Project).where(
                Project.id == project_id,
                Project.org_id == org_id,
            )
        )
        project = result.scalar_one_or_none()
        if project is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "PROJECT_NOT_FOUND", "message": "Project not found"},
            )
        return project

    async def _get_task(self, task_id: UUID, org_id: UUID) -> Task:
        result = await self.db.execute(
            select(Task).where(Task.id == task_id, Task.org_id == org_id)
        )
        task = result.scalar_one_or_none()
        if task is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "TASK_NOT_FOUND", "message": "Task not found"},
            )
        return task

    async def _get_status(
        self, status_id: UUID, project_id: UUID, org_id: UUID
    ) -> TaskStatus:
        result = await self.db.execute(
            select(TaskStatus).where(
                TaskStatus.id == status_id,
                TaskStatus.project_id == project_id,
                TaskStatus.org_id == org_id,
            )
        )
        s = result.scalar_one_or_none()
        if s is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "STATUS_NOT_FOUND", "message": "Status not found in this project"},
            )
        return s

    async def _get_comment(self, comment_id: UUID, org_id: UUID) -> Comment:
        """Load comment and verify it belongs to a task in the org."""
        result = await self.db.execute(
            select(Comment)
            .join(Task, Comment.task_id == Task.id)
            .where(Comment.id == comment_id, Task.org_id == org_id)
        )
        comment = result.scalar_one_or_none()
        if comment is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "COMMENT_NOT_FOUND", "message": "Comment not found"},
            )
        return comment

    async def _verify_user_in_org(self, user_id: UUID, org_id: UUID) -> None:
        """Verify a user is a member of the org."""
        from app.models.member import OrgMember
        result = await self.db.execute(
            select(OrgMember).where(
                OrgMember.user_id == user_id,
                OrgMember.org_id == org_id,
            )
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "USER_NOT_IN_ORG", "message": "Assignee is not a member of this organization"},
            )

    async def _load_labels_for_tasks(
        self, task_ids: list[UUID]
    ) -> dict[UUID, list[LabelResponse]]:
        """Load all labels for a list of task IDs in a single query."""
        if not task_ids:
            return {}

        result = await self.db.execute(
            select(TaskLabel, Label)
            .join(Label, TaskLabel.label_id == Label.id)
            .where(TaskLabel.task_id.in_(task_ids))
        )
        rows = result.all()

        labels_by_task: dict[UUID, list[LabelResponse]] = {}
        for task_label, label in rows:
            if task_label.task_id not in labels_by_task:
                labels_by_task[task_label.task_id] = []
            labels_by_task[task_label.task_id].append(
                LabelResponse(id=label.id, name=label.name, color=label.color)
            )

        return labels_by_task

    async def _set_task_labels(
        self,
        task_id: UUID,
        label_ids: list[UUID],
        project_id: UUID,
        org_id: UUID,
    ) -> None:
        """Replace all labels on a task with the given label_ids."""
        existing = await self.db.execute(
            select(TaskLabel).where(TaskLabel.task_id == task_id)
        )
        for tl in existing.scalars().all():
            await self.db.delete(tl)

        for label_id in label_ids:
            label_result = await self.db.execute(
                select(Label).where(
                    Label.id == label_id,
                    Label.project_id == project_id,
                    Label.org_id == org_id,
                )
            )
            if label_result.scalar_one_or_none() is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"code": "LABEL_NOT_FOUND", "message": f"Label {label_id} not found in this project"},
                )
            self.db.add(TaskLabel(task_id=task_id, label_id=label_id))

    async def _log_activity(
        self,
        org_id: UUID,
        task_id: UUID,
        actor_id: UUID,
        action: str,
        entity_type: str,
        entity_id: UUID,
        old_value: dict[str, Any] | None = None,
        new_value: dict[str, Any] | None = None,
    ) -> None:
        """Append an activity log entry."""
        log = ActivityLog(
            org_id=org_id,
            task_id=task_id,
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            old_value=old_value,
            new_value=new_value,
        )
        self.db.add(log)