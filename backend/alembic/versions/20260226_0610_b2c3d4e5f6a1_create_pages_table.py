"""create_pages_table

Revision ID: b2c3d4e5f6a1
Revises: a1b2c3d4e5f6
Create Date: 2026-02-26 06:10:00.000000
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "b2c3d4e5f6a1"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pages",
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
            "space_id",
            UUID(as_uuid=True),
            sa.ForeignKey("wiki_spaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "parent_page_id",
            UUID(as_uuid=True),
            sa.ForeignKey("pages.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("content_json", JSONB, nullable=True),
        sa.Column("icon_emoji", sa.String(10), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("depth", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "last_edited_by",
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
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_pages_org_id", "pages", ["org_id"])
    op.create_index("ix_pages_space_id", "pages", ["space_id"])
    op.create_index("ix_pages_parent_page_id", "pages", ["parent_page_id"])
    op.create_index("ix_pages_space_position", "pages", ["space_id", "position"])
    op.create_index("ix_pages_created_at", "pages", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_pages_created_at", "pages")
    op.drop_index("ix_pages_space_position", "pages")
    op.drop_index("ix_pages_parent_page_id", "pages")
    op.drop_index("ix_pages_space_id", "pages")
    op.drop_index("ix_pages_org_id", "pages")
    op.drop_table("pages")