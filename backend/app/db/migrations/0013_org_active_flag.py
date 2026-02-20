"""Add organization active flag for subscription gating."""

from alembic import op
import sqlalchemy as sa


revision = "0013_org_active_flag"
down_revision = "0012_rls_policies"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("organizations", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")))


def downgrade():
    op.drop_column("organizations", "is_active")
