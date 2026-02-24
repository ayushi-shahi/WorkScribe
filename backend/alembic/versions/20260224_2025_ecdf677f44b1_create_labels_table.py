"""create_labels_table

Revision ID: ecdf677f44b1
Revises: 5e17602e0625
Create Date: 2026-02-24 20:25:00

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'ecdf677f44b1'
down_revision: Union[str, None] = '5e17602e0625'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE labels (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name VARCHAR(50) NOT NULL,
            color VARCHAR(7) NOT NULL DEFAULT '#6366f1',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX idx_labels_org_id ON labels(org_id)")
    op.execute("CREATE INDEX idx_labels_project_id ON labels(project_id)")
    op.execute("CREATE UNIQUE INDEX idx_labels_project_name ON labels(project_id, name)")

    op.execute("""
        CREATE TABLE task_labels (
            task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
            PRIMARY KEY (task_id, label_id)
        )
    """)
    op.execute("CREATE INDEX idx_task_labels_task_id ON task_labels(task_id)")
    op.execute("CREATE INDEX idx_task_labels_label_id ON task_labels(label_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS task_labels")
    op.execute("DROP TABLE IF EXISTS labels")