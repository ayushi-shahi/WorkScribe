"""create_org_members_table

Revision ID: b34dd7423f23
Revises: a54c165357e6
Create Date: 2026-02-21 12:57:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'b34dd7423f23'
down_revision: Union[str, None] = 'a54c165357e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    """Create org_members table with role enum."""
    # SQLAlchemy Enum will create the type automatically, no need for manual CREATE TYPE
    op.create_table(
        'org_members',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('org_id', UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), nullable=False),
        sa.Column('role', sa.Enum('owner', 'admin', 'member', name='org_role', create_type=True), nullable=False),
        sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    
    op.create_foreign_key(
        'org_members_org_id_fkey',
        'org_members', 'organizations',
        ['org_id'], ['id'],
        ondelete='CASCADE'
    )
    op.create_foreign_key(
        'org_members_user_id_fkey',
        'org_members', 'users',
        ['user_id'], ['id'],
        ondelete='CASCADE'
    )
    
    op.create_index('idx_org_members_org_id', 'org_members', ['org_id'])
    op.create_index('idx_org_members_user_id', 'org_members', ['user_id'])
    op.create_index('idx_org_members_org_user', 'org_members', ['org_id', 'user_id'], unique=True)

def downgrade() -> None:
    """Drop org_members table and role enum."""
    op.drop_index('idx_org_members_org_user', table_name='org_members')
    op.drop_index('idx_org_members_user_id', table_name='org_members')
    op.drop_index('idx_org_members_org_id', table_name='org_members')
    op.drop_constraint('org_members_user_id_fkey', 'org_members', type_='foreignkey')
    op.drop_constraint('org_members_org_id_fkey', 'org_members', type_='foreignkey')
    op.drop_table('org_members')
    sa.Enum(name='org_role').drop(op.get_bind(), checkfirst=True)
