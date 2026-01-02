"""Add dashboard snapshots and plan columns."""

from sqlalchemy import text

from backend.app.db.session import engine
from backend.app.models.dashboard_snapshot import DashboardSnapshot


def upgrade():
    DashboardSnapshot.__table__.create(bind=engine, checkfirst=True)
    with engine.begin() as connection:
        connection.execute(
            text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_tier VARCHAR(64) DEFAULT 'starter'")
        )
        connection.execute(
            text(
                "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS usage_limits_json JSONB DEFAULT '{}'::jsonb"
            )
        )


def downgrade():
    DashboardSnapshot.__table__.drop(bind=engine, checkfirst=True)
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE organizations DROP COLUMN IF EXISTS plan_tier"))
        connection.execute(text("ALTER TABLE organizations DROP COLUMN IF EXISTS usage_limits_json"))


if __name__ == "__main__":
    upgrade()
