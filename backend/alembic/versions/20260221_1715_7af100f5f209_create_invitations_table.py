"""create_invitations_table

Revision ID: 7af100f5f209
Revises: b34dd7423f23
Create Date: 2026-02-21

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = "7af100f5f209"
down_revision: Union[str, None] = "b34dd7423f23"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create invitations table
    op.create_table(
        "invitations",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("org_id", UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column(
            "role",
            sa.Enum(
                "owner",
                "admin",
                "member",
                name="org_role",
                create_type=False,     # do NOT recreate enum
                native_enum=False      # prevent enum DDL emission
            ),
            nullable=False,
        ),
        sa.Column("token", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # Foreign keys
    op.create_foreign_key(
        "invitations_org_id_fkey",
        "invitations",
        "organizations",
        ["org_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.create_foreign_key(
        "invitations_created_by_fkey",
        "invitations",
        "users",
        ["created_by"],
        ["id"],
        ondelete="CASCADE",
    )

    # Indexes
    op.create_index("idx_invitations_org_id", "invitations", ["org_id"])
    op.create_index(
        "idx_invitations_token", "invitations", ["token"], unique=True
    )
    op.create_index("idx_invitations_email", "invitations", ["email"])
    op.create_index(
        "idx_invitations_expires_at", "invitations", ["expires_at"]
    )


def downgrade() -> None:
    # Drop indexes
    op.drop_index("idx_invitations_expires_at", table_name="invitations")
    op.drop_index("idx_invitations_email", table_name="invitations")
    op.drop_index("idx_invitations_token", table_name="invitations")
    op.drop_index("idx_invitations_org_id", table_name="invitations")

    # Drop foreign keys
    op.drop_constraint(
        "invitations_created_by_fkey",
        "invitations",
        type_="foreignkey",
    )
    op.drop_constraint(
        "invitations_org_id_fkey",
        "invitations",
        type_="foreignkey",
    )

    # Drop table
    op.drop_table("invitations")