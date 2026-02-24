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
    op.create_table(
        'task_statuses',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('org_id', UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('category', sa.Enum('todo', 'in_progress', 'done', name='status_category', create_type=False), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('color', sa.String(7), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_foreign_key('task_statuses_org_id_fkey', 'task_statuses', 'organizations', ['org_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key('task_statuses_project_id_fkey', 'task_statuses', 'projects', ['project_id'], ['id'], ondelete='CASCADE')

    op.create_index('idx_task_statuses_org_id', 'task_statuses', ['org_id'])
    op.create_index('idx_task_statuses_project_id', 'task_statuses', ['project_id'])
    op.create_index('idx_task_statuses_position', 'task_statuses', ['project_id', 'position'])


def downgrade() -> None:
    op.drop_index('idx_task_statuses_position', table_name='task_statuses')
    op.drop_index('idx_task_statuses_project_id', table_name='task_statuses')
    op.drop_index('idx_task_statuses_org_id', table_name='task_statuses')
    op.drop_constraint('task_statuses_project_id_fkey', 'task_statuses', type_='foreignkey')
    op.drop_constraint('task_statuses_org_id_fkey', 'task_statuses', type_='foreignkey')
    op.drop_table('task_statuses')
    op.execute('DROP TYPE IF EXISTS status_category')