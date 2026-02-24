"""create_project_task_counters

Revision ID: 781adcc799be
Revises: 748cc8ebec25
Create Date: 2026-02-24 20:09:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = '781adcc799be'
down_revision: Union[str, None] = '748cc8ebec25'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'project_task_counters',
        sa.Column('project_id', UUID(as_uuid=True), nullable=False),
        sa.Column('last_number', sa.Integer(), nullable=False, server_default='0'),
    )
    op.create_foreign_key(
        'project_task_counters_project_id_fkey',
        'project_task_counters', 'projects',
        ['project_id'], ['id'],
        ondelete='CASCADE'
    )
    op.create_primary_key('project_task_counters_pkey', 'project_task_counters', ['project_id'])


def downgrade() -> None:
    op.drop_constraint('project_task_counters_project_id_fkey', 'project_task_counters', type_='foreignkey')
    op.drop_table('project_task_counters')