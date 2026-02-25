"""seed_default_task_statuses

Revision ID: 0648337901e5
Revises: 39aa237c8415
Create Date: 2026-02-24 20:38:00

"""
from typing import Sequence, Union

from alembic import op

revision: str = '0648337901e5'
down_revision: Union[str, None] = '39aa237c8415'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE OR REPLACE FUNCTION seed_default_task_statuses()
        RETURNS TRIGGER AS $$
        BEGIN
            INSERT INTO task_statuses (id, org_id, project_id, name, category, position, color)
            VALUES
                (gen_random_uuid(), NEW.org_id, NEW.id, 'To Do',       'todo',        0, '#6366f1'),
                (gen_random_uuid(), NEW.org_id, NEW.id, 'In Progress', 'in_progress', 1, '#f59e0b'),
                (gen_random_uuid(), NEW.org_id, NEW.id, 'Done',        'done',        2, '#10b981');
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        CREATE TRIGGER trigger_seed_default_task_statuses
        AFTER INSERT ON projects
        FOR EACH ROW
        EXECUTE FUNCTION seed_default_task_statuses();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trigger_seed_default_task_statuses ON projects")
    op.execute("DROP FUNCTION IF EXISTS seed_default_task_statuses")