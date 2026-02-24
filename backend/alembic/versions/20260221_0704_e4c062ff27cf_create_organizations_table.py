"""create_organizations_table

Revision ID: e4c062ff27cf
Revises: 
Create Date: 2026-02-21 07:04:12.345678

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = 'e4c062ff27cf'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create organizations table."""
    op.create_table(
        'organizations',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('slug', sa.String(length=50), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    
    # Create indexes
    op.create_index('idx_organizations_slug', 'organizations', ['slug'], unique=True)
    op.create_index('idx_organizations_created_at', 'organizations', ['created_at'])


def downgrade() -> None:
    """Drop organizations table."""
    op.drop_index('idx_organizations_created_at', table_name='organizations')
    op.drop_index('idx_organizations_slug', table_name='organizations')
    op.drop_table('organizations')