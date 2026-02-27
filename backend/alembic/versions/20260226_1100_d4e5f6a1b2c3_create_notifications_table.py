"""create_notifications_table

Revision ID: d4e5f6a1b2c3
Revises: c3d4e5f6a1b2
Create Date: 2026-02-26 11:00:00.000000
"""
from __future__ import annotations

from alembic import op

revision = "d4e5f6a1b2c3"
down_revision = "c3d4e5f6a1b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE TYPE notification_type AS ENUM "
        "('TASK_ASSIGNED', 'MENTION', 'TASK_DONE')"
    )

    op.execute("""
        CREATE TABLE notifications (
            id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            type        notification_type NOT NULL,
            title       VARCHAR(255) NOT NULL,
            body        TEXT,
            entity_type VARCHAR(50) NOT NULL,
            entity_id   UUID        NOT NULL,
            is_read     BOOLEAN     NOT NULL DEFAULT false,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    op.execute("CREATE INDEX ix_notifications_org_id ON notifications(org_id)")
    op.execute("CREATE INDEX ix_notifications_user_id ON notifications(user_id)")
    op.execute("CREATE INDEX ix_notifications_user_is_read ON notifications(user_id, is_read)")
    op.execute("CREATE INDEX ix_notifications_created_at ON notifications(created_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS notifications")
    op.execute("DROP TYPE IF EXISTS notification_type")