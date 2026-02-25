"""Add organization active flag for subscription gating."""

from sqlalchemy import text

from backend.app.db.session import engine


revision = "0013_org_active_flag"
down_revision = "0012_rls_policies"
branch_labels = None
depends_on = None


def upgrade():
    with engine.begin() as connection:
        connection.execute(
            text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE")
        )


def downgrade():
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE organizations DROP COLUMN IF EXISTS is_active"))
