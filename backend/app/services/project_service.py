"""
Project business logic.

Handles project CRUD operations.
"""

from __future__ import annotations

from uuid import UUID

import redis.asyncio as aioredis
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member import OrgMember, OrgRole
from app.models.organization import Organization
from app.models.project import Project, ProjectType
from app.models.user import User
from app.schemas.project import (
    ProjectCreateRequest,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdateRequest,
)


class ProjectService:

    def __init__(self, db: AsyncSession, redis: aioredis.Redis) -> None:
        self.db = db
        self.redis = redis

    async def list_projects(self, org_id: UUID) -> ProjectListResponse:
        result = await self.db.execute(
            select(Project)
            .where(Project.org_id == org_id, Project.is_archived == False)
            .order_by(Project.created_at)
        )
        projects = list(result.scalars().all())
        return ProjectListResponse(
            projects=[ProjectResponse.model_validate(p) for p in projects],
            total=len(projects),
        )

    async def create_project(
        self, org_id: UUID, data: ProjectCreateRequest, creator: User
    ) -> ProjectResponse:
        # Check key uniqueness within org
        existing = await self.db.execute(
            select(Project).where(
                Project.org_id == org_id,
                Project.key == data.key,
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "KEY_TAKEN", "message": f"Project key '{data.key}' already exists in this organization"},
            )

        project = Project(
            org_id=org_id,
            name=data.name,
            key=data.key,
            description=data.description,
            type=ProjectType(data.type),
            created_by=creator.id,
        )
        self.db.add(project)
        await self.db.flush()
        await self.db.refresh(project)
        return ProjectResponse.model_validate(project)

    async def get_project(self, project_id: UUID, org_id: UUID) -> ProjectResponse:
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
        return ProjectResponse.model_validate(project)

    async def update_project(
        self, project_id: UUID, org_id: UUID, data: ProjectUpdateRequest
    ) -> ProjectResponse:
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
        if data.name is not None:
            project.name = data.name
        if data.description is not None:
            project.description = data.description
        await self.db.flush()
        await self.db.refresh(project)
        return ProjectResponse.model_validate(project)

    async def archive_project(self, project_id: UUID, org_id: UUID) -> None:
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
        project.is_archived = True
        await self.db.flush()