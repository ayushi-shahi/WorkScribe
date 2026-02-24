"""create_comments_table

Revision ID: b8a2eb912e01
Revises: ecdf677f44b1
Create Date: 2026-02-24 20:27:00

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'b8a2eb912e01'
down_revision: Union[str, None] = 'ecdf677f44b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE comments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            body_json JSONB NOT NULL,
            is_edited BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX idx_comments_task_id ON comments(task_id)")
    op.execute("CREATE INDEX idx_comments_author_id ON comments(author_id)")
    op.execute("CREATE INDEX idx_comments_created_at ON comments(task_id, created_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS comments")