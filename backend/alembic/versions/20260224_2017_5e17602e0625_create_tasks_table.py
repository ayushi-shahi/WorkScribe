"""create_tasks_table

Revision ID: 5e17602e0625
Revises: 781adcc799be
Create Date: 2026-02-24 20:17:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = '5e17602e0625'
down_revision: Union[str, None] = '781adcc799be'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE TYPE task_priority AS ENUM ('urgent', 'high', 'medium', 'low', 'none')")
    op.execute("CREATE TYPE task_type AS ENUM ('story', 'bug', 'task', 'subtask')")
    op.execute("""
        CREATE TABLE tasks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            number INTEGER NOT NULL,
            title VARCHAR(500) NOT NULL,
            description_json JSONB,
            status_id UUID NOT NULL REFERENCES task_statuses(id) ON DELETE RESTRICT,
            assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
            reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            priority task_priority NOT NULL DEFAULT 'none',
            type task_type NOT NULL DEFAULT 'task',
            parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
            sprint_id UUID,
            position INTEGER NOT NULL DEFAULT 0,
            due_date DATE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE UNIQUE INDEX idx_tasks_project_number ON tasks(project_id, number)")
    op.execute("CREATE INDEX idx_tasks_org_id ON tasks(org_id)")
    op.execute("CREATE INDEX idx_tasks_project_id ON tasks(project_id)")
    op.execute("CREATE INDEX idx_tasks_project_status ON tasks(project_id, status_id)")
    op.execute("CREATE INDEX idx_tasks_assignee ON tasks(assignee_id) WHERE assignee_id IS NOT NULL")
    op.execute("CREATE INDEX idx_tasks_sprint ON tasks(sprint_id) WHERE sprint_id IS NOT NULL")
    op.execute("CREATE INDEX idx_tasks_created_at ON tasks(created_at)")

def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tasks")
    op.execute("DROP TYPE IF EXISTS task_priority")
    op.execute("DROP TYPE IF EXISTS task_type")