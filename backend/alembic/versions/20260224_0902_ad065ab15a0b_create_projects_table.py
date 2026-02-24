"""create_projects_table

Revision ID: ad065ab15a0b
Revises: 7af100f5f209
Create Date: 2026-02-24 09:02:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'ad065ab15a0b'
down_revision: Union[str, None] = '7af100f5f209'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create projects table."""
    op.create_table(
        'projects',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('org_id', UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('key', sa.String(length=5), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('type', sa.Enum('kanban', 'scrum', name='project_type', create_type=False), nullable=False, server_default='kanban'),
        sa.Column('is_archived', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_by', UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_foreign_key(
        'projects_org_id_fkey',
        'projects', 'organizations',
        ['org_id'], ['id'],
        ondelete='CASCADE'
    )
    op.create_foreign_key(
        'projects_created_by_fkey',
        'projects', 'users',
        ['created_by'], ['id'],
        ondelete='CASCADE'
    )

    op.create_index('idx_projects_org_id', 'projects', ['org_id'])
    op.create_index('idx_projects_org_key', 'projects', ['org_id', 'key'], unique=True)
    op.create_index('idx_projects_created_at', 'projects', ['created_at'])


def downgrade() -> None:
    """Drop projects table."""
    op.drop_index('idx_projects_created_at', table_name='projects')
    op.drop_index('idx_projects_org_key', table_name='projects')
    op.drop_index('idx_projects_org_id', table_name='projects')
    op.drop_constraint('projects_created_by_fkey', 'projects', type_='foreignkey')
    op.drop_constraint('projects_org_id_fkey', 'projects', type_='foreignkey')
    op.drop_table('projects')
    op.execute('DROP TYPE IF EXISTS project_type')