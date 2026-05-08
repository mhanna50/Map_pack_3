"""Service-aware keyword strategy workflow tables and columns."""

from sqlalchemy import text

from backend.app.db.session import engine
from backend.app.models import BusinessService


revision = "0019_service_keyword_workflow"
down_revision = "0018_stripe_webhook_events"
branch_labels = None
depends_on = None


def upgrade():
    BusinessService.__table__.create(bind=engine, checkfirst=True)
    if engine.url.get_backend_name() != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(
            text("ALTER TABLE keyword_candidates ADD COLUMN IF NOT EXISTS business_service_id UUID")
        )
        connection.execute(text("ALTER TABLE keyword_candidates ADD COLUMN IF NOT EXISTS provider VARCHAR(64)"))
        connection.execute(
            text("ALTER TABLE keyword_candidates ADD COLUMN IF NOT EXISTS source_query_json JSONB DEFAULT '{}'::jsonb")
        )
        connection.execute(text("ALTER TABLE keyword_candidates ADD COLUMN IF NOT EXISTS avg_monthly_searches INTEGER"))
        connection.execute(text("ALTER TABLE keyword_candidates ADD COLUMN IF NOT EXISTS average_cpc_micros BIGINT"))
        connection.execute(
            text("ALTER TABLE keyword_candidates ADD COLUMN IF NOT EXISTS top_of_page_bid_low_micros BIGINT")
        )
        connection.execute(
            text("ALTER TABLE keyword_candidates ADD COLUMN IF NOT EXISTS top_of_page_bid_high_micros BIGINT")
        )
        connection.execute(text("ALTER TABLE keyword_candidates ADD COLUMN IF NOT EXISTS competition_index DOUBLE PRECISION"))
        connection.execute(text("ALTER TABLE keyword_candidates ADD COLUMN IF NOT EXISTS competition_level VARCHAR(32)"))
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_keyword_candidate_service ON keyword_candidates (business_service_id)")
        )

        connection.execute(text("ALTER TABLE keyword_scores ADD COLUMN IF NOT EXISTS business_service_id UUID"))
        connection.execute(text("ALTER TABLE keyword_scores ADD COLUMN IF NOT EXISTS value_score DOUBLE PRECISION DEFAULT 0"))
        connection.execute(text("ALTER TABLE keyword_scores ADD COLUMN IF NOT EXISTS average_cpc_micros BIGINT"))
        connection.execute(text("ALTER TABLE keyword_scores ADD COLUMN IF NOT EXISTS top_of_page_bid_low_micros BIGINT"))
        connection.execute(text("ALTER TABLE keyword_scores ADD COLUMN IF NOT EXISTS top_of_page_bid_high_micros BIGINT"))
        connection.execute(text("ALTER TABLE keyword_scores ADD COLUMN IF NOT EXISTS competition_index DOUBLE PRECISION"))
        connection.execute(text("ALTER TABLE keyword_scores ADD COLUMN IF NOT EXISTS service_value_cents INTEGER"))
        connection.execute(
            text("ALTER TABLE keyword_scores ADD COLUMN IF NOT EXISTS score_formula_json JSONB DEFAULT '{}'::jsonb")
        )
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_keyword_score_service ON keyword_scores (business_service_id)"))

        connection.execute(text("ALTER TABLE selected_keywords ADD COLUMN IF NOT EXISTS business_service_id UUID"))
        connection.execute(text("ALTER TABLE selected_keywords ADD COLUMN IF NOT EXISTS previous_selected_keyword_id UUID"))
        connection.execute(text("ALTER TABLE selected_keywords ADD COLUMN IF NOT EXISTS service_rank_order INTEGER"))
        connection.execute(text("ALTER TABLE selected_keywords ADD COLUMN IF NOT EXISTS average_cpc_micros BIGINT"))
        connection.execute(text("ALTER TABLE selected_keywords ADD COLUMN IF NOT EXISTS top_of_page_bid_low_micros BIGINT"))
        connection.execute(text("ALTER TABLE selected_keywords ADD COLUMN IF NOT EXISTS top_of_page_bid_high_micros BIGINT"))
        connection.execute(text("ALTER TABLE selected_keywords ADD COLUMN IF NOT EXISTS competition_index DOUBLE PRECISION"))
        connection.execute(text("ALTER TABLE selected_keywords ADD COLUMN IF NOT EXISTS service_value_cents INTEGER"))
        connection.execute(
            text("ALTER TABLE selected_keywords ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active'")
        )
        connection.execute(
            text("ALTER TABLE selected_keywords ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true")
        )
        connection.execute(
            text("ALTER TABLE selected_keywords ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false")
        )
        connection.execute(text("ALTER TABLE selected_keywords ADD COLUMN IF NOT EXISTS active_since TIMESTAMPTZ"))
        connection.execute(text("ALTER TABLE selected_keywords ADD COLUMN IF NOT EXISTS active_until TIMESTAMPTZ"))
        connection.execute(text("ALTER TABLE selected_keywords ADD COLUMN IF NOT EXISTS replacement_reason VARCHAR(512)"))
        connection.execute(
            text("ALTER TABLE selected_keywords ADD COLUMN IF NOT EXISTS performance_json JSONB DEFAULT '{}'::jsonb")
        )
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_selected_keyword_service ON selected_keywords (business_service_id)"))
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_selected_keyword_active ON selected_keywords (location_id, is_active, status)")
        )

        connection.execute(text("ALTER TABLE gbp_post_keyword_mappings ADD COLUMN IF NOT EXISTS business_service_id UUID"))
        connection.execute(text("ALTER TABLE gbp_post_keyword_mappings ADD COLUMN IF NOT EXISTS service_name VARCHAR(255)"))
        connection.execute(text("ALTER TABLE gbp_post_keyword_mappings ADD COLUMN IF NOT EXISTS media_asset_id UUID"))
        connection.execute(text("ALTER TABLE gbp_post_keyword_mappings ADD COLUMN IF NOT EXISTS proximity_target VARCHAR(128)"))
        connection.execute(text("ALTER TABLE gbp_post_keyword_mappings ADD COLUMN IF NOT EXISTS proximity_source VARCHAR(64)"))
        connection.execute(text("ALTER TABLE gbp_post_keyword_mappings ADD COLUMN IF NOT EXISTS metadata_json JSONB DEFAULT '{}'::jsonb"))
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_gbp_post_keyword_mapping_service ON gbp_post_keyword_mappings (business_service_id)")
        )


def downgrade():
    if engine.url.get_backend_name() == "postgresql":
        with engine.begin() as connection:
            connection.execute(text("DROP INDEX IF EXISTS ix_gbp_post_keyword_mapping_service"))
            connection.execute(text("DROP INDEX IF EXISTS ix_selected_keyword_active"))
            connection.execute(text("DROP INDEX IF EXISTS ix_selected_keyword_service"))
            connection.execute(text("DROP INDEX IF EXISTS ix_keyword_score_service"))
            connection.execute(text("DROP INDEX IF EXISTS ix_keyword_candidate_service"))
    BusinessService.__table__.drop(bind=engine, checkfirst=True)


if __name__ == "__main__":  # pragma: no cover
    upgrade()
