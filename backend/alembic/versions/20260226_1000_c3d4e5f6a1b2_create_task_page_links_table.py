"""create_task_page_links_table

Revision ID: c3d4e5f6a1b2
Revises: b2c3d4e5f6a1
Create Date: 2026-02-26 10:00:00.000000
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "c3d4e5f6a1b2"
down_revision = "b2c3d4e5f6a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_page_links",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "org_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "task_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tasks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "page_id",
            UUID(as_uuid=True),
            sa.ForeignKey("pages.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("task_id", "page_id", name="uq_task_page_links_task_page"),
    )

    op.create_index("ix_task_page_links_org_id", "task_page_links", ["org_id"])
    op.create_index("ix_task_page_links_task_id", "task_page_links", ["task_id"])
    op.create_index("ix_task_page_links_page_id", "task_page_links", ["page_id"])
    op.create_index("ix_task_page_links_created_at", "task_page_links", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_task_page_links_created_at", "task_page_links")
    op.drop_index("ix_task_page_links_page_id", "task_page_links")
    op.drop_index("ix_task_page_links_task_id", "task_page_links")
    op.drop_index("ix_task_page_links_org_id", "task_page_links")
    op.drop_table("task_page_links")