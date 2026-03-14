"""Labels router."""
from __future__ import annotations
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user, get_org_member, require_role
from app.models.label import Label, TaskLabel
from app.models.organization import Organization
from app.models.member import OrgMember
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.schemas.task import LabelResponse

router = APIRouter(tags=["Labels"])

class LabelCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    color: str = Field(default="#6366f1", pattern=r"^#[0-9a-fA-F]{6}$")

@router.get("/organizations/{slug}/projects/{project_id}/labels")
async def list_labels(slug: str, project_id: UUID, current_user: User = Depends(get_current_user), org_member: tuple[Organization, OrgMember] = Depends(get_org_member), db: AsyncSession = Depends(get_db)) -> dict:
    org, member = org_member
    proj_result = await db.execute(select(Project).where(Project.id == project_id, Project.org_id == org.id, Project.is_archived.isnot(True)))
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")
    result = await db.execute(select(Label).where(Label.project_id == project_id, Label.org_id == org.id).order_by(Label.created_at.asc()))
    labels = result.scalars().all()
    return {"labels": [LabelResponse.model_validate(lb) for lb in labels], "total": len(labels)}

@router.post("/organizations/{slug}/projects/{project_id}/labels", status_code=status.HTTP_201_CREATED)
async def create_label(slug: str, project_id: UUID, body: LabelCreateRequest, current_user: User = Depends(get_current_user), org_member: tuple[Organization, OrgMember] = Depends(require_role("owner", "admin")), db: AsyncSession = Depends(get_db)) -> LabelResponse:
    org, member = org_member
    proj_result = await db.execute(select(Project).where(Project.id == project_id, Project.org_id == org.id, Project.is_archived.isnot(True)))
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")
    existing = await db.execute(select(Label).where(Label.project_id == project_id, Label.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail={"code": "LABEL_EXISTS", "message": f"Label already exists"})
    label = Label(org_id=org.id, project_id=project_id, name=body.name, color=body.color)
    db.add(label)
    await db.commit()
    await db.refresh(label)
    return LabelResponse.model_validate(label)

@router.delete("/organizations/{slug}/projects/{project_id}/labels/{label_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_label(slug: str, project_id: UUID, label_id: UUID, current_user: User = Depends(get_current_user), org_member: tuple[Organization, OrgMember] = Depends(require_role("owner", "admin")), db: AsyncSession = Depends(get_db)):
    org, member = org_member
    result = await db.execute(select(Label).where(Label.id == label_id, Label.project_id == project_id, Label.org_id == org.id))
    label = result.scalar_one_or_none()
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")
    await db.delete(label)
    await db.commit()
    return Response(status_code=204)

@router.post("/tasks/{task_id}/labels/{label_id}", status_code=status.HTTP_201_CREATED)
async def assign_label(task_id: UUID, label_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> LabelResponse:
    task_result = await db.execute(select(Task).where(Task.id == task_id))
    task = task_result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    label_result = await db.execute(select(Label).where(Label.id == label_id, Label.project_id == task.project_id))
    label = label_result.scalar_one_or_none()
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")
    existing = await db.execute(select(TaskLabel).where(TaskLabel.task_id == task_id, TaskLabel.label_id == label_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail={"code": "LABEL_ALREADY_ASSIGNED", "message": "Label already assigned"})
    db.add(TaskLabel(task_id=task_id, label_id=label_id))
    await db.commit()
    return LabelResponse.model_validate(label)

@router.delete("/tasks/{task_id}/labels/{label_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_label(task_id: UUID, label_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TaskLabel).where(TaskLabel.task_id == task_id, TaskLabel.label_id == label_id))
    task_label = result.scalar_one_or_none()
    if not task_label:
        raise HTTPException(status_code=404, detail="Label not assigned to this task")
    await db.delete(task_label)
    await db.commit()
    return Response(status_code=204)
