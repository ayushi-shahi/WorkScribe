"""create_sprints_table

Revision ID: b4fb5d09bb90
Revises: 0648337901e5
Create Date: 2026-02-26 04:32:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'b4fb5d09bb90'
down_revision: Union[str, None] = '0648337901e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE TYPE sprint_status AS ENUM ('planned', 'active', 'completed')")
    op.execute("""
        CREATE TABLE sprints (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            goal TEXT,
            status sprint_status NOT NULL DEFAULT 'planned',
            start_date DATE,
            end_date DATE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    op.execute("CREATE INDEX idx_sprints_org_id ON sprints(org_id)")
    op.execute("CREATE INDEX idx_sprints_project_id ON sprints(project_id)")
    op.execute("CREATE INDEX idx_sprints_status ON sprints(project_id, status)")
    op.execute("CREATE INDEX idx_sprints_created_at ON sprints(created_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS sprints")
    op.execute("DROP TYPE IF EXISTS sprint_status")