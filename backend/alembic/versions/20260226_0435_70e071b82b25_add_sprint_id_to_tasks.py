"""add_sprint_id_to_tasks

Revision ID: 70e071b82b25
Revises: b4fb5d09bb90
Create Date: 2026-02-26 04:35:00

"""
from typing import Sequence, Union

from alembic import op

revision: str = '70e071b82b25'
down_revision: Union[str, None] = 'b4fb5d09bb90'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add FK constraint from tasks.sprint_id to sprints.id
    # The sprint_id column already exists on tasks table (added in create_tasks_table migration)
    # We just need to add the FK constraint now that sprints table exists
    op.execute("""
        ALTER TABLE tasks
        ADD CONSTRAINT tasks_sprint_id_fkey
        FOREIGN KEY (sprint_id) REFERENCES sprints(id) ON DELETE SET NULL
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_sprint_id_fkey")