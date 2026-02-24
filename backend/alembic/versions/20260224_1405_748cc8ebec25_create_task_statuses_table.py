"""create_task_statuses_table

Revision ID: 748cc8ebec25
Revises: ad065ab15a0b
Create Date: 2026-02-24 14:05:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = '748cc8ebec25'
down_revision: Union[str, None] = 'ad065ab15a0b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE TYPE status_category AS ENUM ('todo', 'in_progress', 'done')")
    op.execute("""
        CREATE TABLE task_statuses (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            category status_category NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            color VARCHAR(7),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX idx_task_statuses_org_id ON task_statuses(org_id)")
    op.execute("CREATE INDEX idx_task_statuses_project_id ON task_statuses(project_id)")
    op.execute("CREATE INDEX idx_task_statuses_position ON task_statuses(project_id, position)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS task_statuses")
    op.execute("DROP TYPE IF EXISTS status_category")