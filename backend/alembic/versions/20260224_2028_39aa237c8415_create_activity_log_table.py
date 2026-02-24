"""create_activity_log_table

Revision ID: 39aa237c8415
Revises: b8a2eb912e01
Create Date: 2026-02-24 20:28:00

"""
from typing import Sequence, Union

from alembic import op

revision: str = '39aa237c8415'
down_revision: Union[str, None] = 'b8a2eb912e01'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE activity_log (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
            actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            action VARCHAR(100) NOT NULL,
            entity_type VARCHAR(50) NOT NULL,
            entity_id UUID NOT NULL,
            old_value JSONB,
            new_value JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX idx_activity_log_org_id ON activity_log(org_id)")
    op.execute("CREATE INDEX idx_activity_log_task_id ON activity_log(task_id) WHERE task_id IS NOT NULL")
    op.execute("CREATE INDEX idx_activity_log_actor_id ON activity_log(actor_id)")
    op.execute("CREATE INDEX idx_activity_log_entity ON activity_log(entity_type, entity_id)")
    op.execute("CREATE INDEX idx_activity_log_created_at ON activity_log(created_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS activity_log")