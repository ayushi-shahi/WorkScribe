"""
Sprint management endpoints.

Create, start, complete sprints (Scrum).
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
from app.schemas.sprint import (
    SprintCompleteRequest,
    SprintCreateRequest,
    SprintListResponse,
    SprintResponse,
    SprintUpdateRequest,
)
from app.services.sprint_service import SprintService

router = APIRouter()


def get_sprint_service(
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> SprintService:
    return SprintService(db=db, redis=redis)


# ---------------------------------------------------------------------------
# List Sprints
# ---------------------------------------------------------------------------

@router.get(
    "/organizations/{slug}/projects/{project_id}/sprints",
    response_model=SprintListResponse,
    summary="List sprints for a project",
)
async def list_sprints(
    project_id: UUID,
    org_and_member: tuple[Organization, OrgMember] = Depends(get_org_member),
    service: SprintService = Depends(get_sprint_service),
) -> SprintListResponse:
    org, _ = org_and_member
    return await service.list_sprints(project_id, org.id)


# ---------------------------------------------------------------------------
# Create Sprint
# ---------------------------------------------------------------------------

@router.post(
    "/organizations/{slug}/projects/{project_id}/sprints",
    response_model=SprintResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new sprint",
)
async def create_sprint(
    project_id: UUID,
    data: SprintCreateRequest,
    org_and_member: tuple[Organization, OrgMember] = Depends(
        require_role(OrgRole.owner, OrgRole.admin)
    ),
    service: SprintService = Depends(get_sprint_service),
) -> SprintResponse:
    org, _ = org_and_member
    return await service.create_sprint(project_id, org.id, data)


# ---------------------------------------------------------------------------
# Update Sprint
# ---------------------------------------------------------------------------

@router.patch(
    "/sprints/{sprint_id}",
    response_model=SprintResponse,
    summary="Update sprint details",
)
async def update_sprint(
    sprint_id: UUID,
    data: SprintUpdateRequest,
    current_user: User = Depends(get_current_user),
    service: SprintService = Depends(get_sprint_service),
) -> SprintResponse:
    return await service.update_sprint(sprint_id, current_user, data)


# ---------------------------------------------------------------------------
# Start Sprint
# ---------------------------------------------------------------------------

@router.post(
    "/sprints/{sprint_id}/start",
    response_model=SprintResponse,
    summary="Start a planned sprint",
)
async def start_sprint(
    sprint_id: UUID,
    current_user: User = Depends(get_current_user),
    service: SprintService = Depends(get_sprint_service),
) -> SprintResponse:
    return await service.start_sprint(sprint_id, current_user)


# ---------------------------------------------------------------------------
# Complete Sprint
# ---------------------------------------------------------------------------

@router.post(
    "/sprints/{sprint_id}/complete",
    response_model=SprintResponse,
    summary="Complete an active sprint",
)
async def complete_sprint(
    sprint_id: UUID,
    data: SprintCompleteRequest,
    current_user: User = Depends(get_current_user),
    service: SprintService = Depends(get_sprint_service),
) -> SprintResponse:
    return await service.complete_sprint(sprint_id, current_user, data)


# ---------------------------------------------------------------------------
# Delete Sprint
# ---------------------------------------------------------------------------

@router.delete(
    "/sprints/{sprint_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a planned sprint",
)
async def delete_sprint(
    sprint_id: UUID,
    current_user: User = Depends(get_current_user),
    service: SprintService = Depends(get_sprint_service),
) -> dict:
    await service.delete_sprint(sprint_id, current_user)
    return {}