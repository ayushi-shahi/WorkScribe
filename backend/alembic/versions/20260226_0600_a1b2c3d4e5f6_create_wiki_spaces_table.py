"""create_wiki_spaces_table

Revision ID: a1b2c3d4e5f6
Revises: 70e071b82b25
Create Date: 2026-02-26 06:00:00.000000
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "a1b2c3d4e5f6"
down_revision = "70e071b82b25"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "wiki_spaces",
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
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("key", sa.String(10), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("icon_emoji", sa.String(10), nullable=True),
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
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("org_id", "key", name="uq_wiki_spaces_org_key"),
    )
    op.create_index("ix_wiki_spaces_org_id", "wiki_spaces", ["org_id"])
    op.create_index("ix_wiki_spaces_created_at", "wiki_spaces", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_wiki_spaces_created_at", "wiki_spaces")
    op.drop_index("ix_wiki_spaces_org_id", "wiki_spaces")
    op.drop_table("wiki_spaces")