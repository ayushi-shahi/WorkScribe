"""
ORM models for Wiki Spaces and Pages.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.task_page_link import TaskPageLink
    from app.models.user import User


class WikiSpace(Base):
    __tablename__ = "wiki_spaces"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    key: Mapped[str] = mapped_column(String(10), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon_emoji: Mapped[str | None] = mapped_column(String(10), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )

    # Relationships
    org: Mapped[Organization] = relationship("Organization", back_populates="wiki_spaces")
    creator: Mapped[User | None] = relationship("User", foreign_keys=[created_by])
    pages: Mapped[list[Page]] = relationship(
        "Page", back_populates="space", cascade="all, delete-orphan"
    )


class Page(Base):
    __tablename__ = "pages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    space_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("wiki_spaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    parent_page_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pages.id", ondelete="SET NULL"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    content_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    icon_emoji: Mapped[str | None] = mapped_column(String(10), nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    depth: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    last_edited_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )

    # Relationships
    space: Mapped[WikiSpace] = relationship("WikiSpace", back_populates="pages")
    parent: Mapped[Page | None] = relationship(
        "Page", remote_side="Page.id", back_populates="children", foreign_keys=[parent_page_id]
    )
    children: Mapped[list[Page]] = relationship(
        "Page", back_populates="parent", foreign_keys=[parent_page_id]
    )
    creator: Mapped[User | None] = relationship("User", foreign_keys=[created_by])
    last_editor: Mapped[User | None] = relationship("User", foreign_keys=[last_edited_by])
    task_links: Mapped[list[TaskPageLink]] = relationship(
        "TaskPageLink", back_populates="page", cascade="all, delete-orphan"
    )