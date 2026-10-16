"""Add isolated RefundPath sandbox cases and sessions; retain upstream tables."""
import sqlalchemy as sa

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("rp_sessions", sa.Column("token_hash", sa.String(64), primary_key=True), sa.Column("owner_id", sa.String(36), nullable=False, unique=True), sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("rp_cases", sa.Column("id", sa.String(36), primary_key=True), sa.Column("owner_id", sa.String(36), nullable=False), sa.Column("revision", sa.Integer(), nullable=False), sa.Column("data", sa.JSON(), nullable=False))
    op.create_index("ix_rp_cases_owner_id", "rp_cases", ["owner_id"])


def downgrade():
    op.drop_index("ix_rp_cases_owner_id", table_name="rp_cases")
    op.drop_table("rp_cases")
    op.drop_table("rp_sessions")
