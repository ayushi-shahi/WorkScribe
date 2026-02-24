"""
Project management endpoints.

CRUD operations for projects.
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
from app.schemas.project import (
    ProjectCreateRequest,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdateRequest,
)
from app.services.project_service import ProjectService

router = APIRouter()


def get_project_service(
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> ProjectService:
    return ProjectService(db=db, redis=redis)


@router.get(
    "/organizations/{slug}/projects",
    response_model=ProjectListResponse,
    summary="List all projects in organization",
)
async def list_projects(
    org_and_member: tuple[Organization, OrgMember] = Depends(get_org_member),
    service: ProjectService = Depends(get_project_service),
) -> ProjectListResponse:
    org, _ = org_and_member
    return await service.list_projects(org.id)


@router.post(
    "/organizations/{slug}/projects",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new project",
)
async def create_project(
    data: ProjectCreateRequest,
    org_and_member: tuple[Organization, OrgMember] = Depends(
        require_role(OrgRole.owner, OrgRole.admin)
    ),
    current_user: User = Depends(get_current_user),
    service: ProjectService = Depends(get_project_service),
) -> ProjectResponse:
    org, _ = org_and_member
    return await service.create_project(org.id, data, current_user)


@router.get(
    "/organizations/{slug}/projects/{project_id}",
    response_model=ProjectResponse,
    summary="Get project detail",
)
async def get_project(
    project_id: UUID,
    org_and_member: tuple[Organization, OrgMember] = Depends(get_org_member),
    service: ProjectService = Depends(get_project_service),
) -> ProjectResponse:
    org, _ = org_and_member
    return await service.get_project(project_id, org.id)


@router.patch(
    "/organizations/{slug}/projects/{project_id}",
    response_model=ProjectResponse,
    summary="Update project",
)
async def update_project(
    project_id: UUID,
    data: ProjectUpdateRequest,
    org_and_member: tuple[Organization, OrgMember] = Depends(
        require_role(OrgRole.owner, OrgRole.admin)
    ),
    service: ProjectService = Depends(get_project_service),
) -> ProjectResponse:
    org, _ = org_and_member
    return await service.update_project(project_id, org.id, data)


@router.delete(
    "/organizations/{slug}/projects/{project_id}",
    status_code=status.HTTP_200_OK,
    summary="Archive (soft delete) a project",
)
async def archive_project(
    project_id: UUID,
    org_and_member: tuple[Organization, OrgMember] = Depends(
        require_role(OrgRole.owner)
    ),
    service: ProjectService = Depends(get_project_service),
) -> dict:
    org, _ = org_and_member
    await service.archive_project(project_id, org.id)
    return {}