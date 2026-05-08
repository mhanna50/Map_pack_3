"""Add monthly GBP audit workflow tables and columns."""

from sqlalchemy import text

from backend.app.db.base import Base
from backend.app.db.session import engine
from backend.app.models import ListingAudit, ListingAuditItem


revision = "0020_gbp_audit_workflow"
down_revision = "0019_service_keyword_workflow"
branch_labels = None
depends_on = None


TABLES = [ListingAudit.__table__, ListingAuditItem.__table__]


def upgrade():
    Base.metadata.create_all(bind=engine, tables=TABLES, checkfirst=True)
    if engine.url.get_backend_name() != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                DO $$
                BEGIN
                    CREATE TYPE gbp_automation_status AS ENUM (
                        'pending_gbp_connection',
                        'audit_required',
                        'audit_in_progress',
                        'setup_action_required',
                        'ready_for_automation',
                        'automation_active'
                    );
                EXCEPTION WHEN duplicate_object THEN NULL;
                END $$;
                """
            )
        )
        connection.execute(text("ALTER TABLE listing_audits ADD COLUMN IF NOT EXISTS profile_completeness_score DOUBLE PRECISION"))
        connection.execute(text("ALTER TABLE listing_audits ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'completed'"))
        connection.execute(text("ALTER TABLE listing_audits ADD COLUMN IF NOT EXISTS trigger_source VARCHAR(32) NOT NULL DEFAULT 'manual'"))
        connection.execute(text("ALTER TABLE listing_audits ADD COLUMN IF NOT EXISTS previous_audit_id UUID"))
        connection.execute(text("ALTER TABLE listing_audits ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ"))
        connection.execute(text("ALTER TABLE listing_audits ADD COLUMN IF NOT EXISTS summary_json JSONB DEFAULT '{}'::jsonb"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_listing_audit_org_loc ON listing_audits (tenant_id, location_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_listing_audit_audited_at ON listing_audits (audited_at)"))
        connection.execute(text("ALTER TABLE gbp_optimization_actions ALTER COLUMN campaign_cycle_id DROP NOT NULL"))
        connection.execute(text("ALTER TABLE locations ADD COLUMN IF NOT EXISTS automation_status gbp_automation_status NOT NULL DEFAULT 'pending_gbp_connection'"))
        connection.execute(text("ALTER TABLE locations ADD COLUMN IF NOT EXISTS readiness_json JSONB DEFAULT '{}'::jsonb"))
        connection.execute(text("ALTER TABLE locations ADD COLUMN IF NOT EXISTS readiness_checked_at TIMESTAMPTZ"))


def downgrade():
    with engine.begin() as connection:
        ListingAuditItem.__table__.drop(bind=connection, checkfirst=True)


if __name__ == "__main__":  # pragma: no cover
    upgrade()
