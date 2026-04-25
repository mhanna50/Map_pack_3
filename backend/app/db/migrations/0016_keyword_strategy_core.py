"""Add keyword strategy campaign tables."""

from sqlalchemy import text

from backend.app.db.base import Base
from backend.app.db.session import engine
from backend.app.models import (
    CampaignJobRun,
    GbpOptimizationAction,
    GbpPostKeywordMapping,
    GeoGridScan,
    GeoGridScanPoint,
    KeywordCandidate,
    KeywordCampaignCycle,
    KeywordDashboardAggregate,
    KeywordScore,
    SelectedKeyword,
)


TABLES = [
    KeywordCampaignCycle.__table__,
    KeywordCandidate.__table__,
    KeywordScore.__table__,
    SelectedKeyword.__table__,
    GbpOptimizationAction.__table__,
    GbpPostKeywordMapping.__table__,
    GeoGridScan.__table__,
    GeoGridScanPoint.__table__,
    CampaignJobRun.__table__,
    KeywordDashboardAggregate.__table__,
]


def upgrade():
    Base.metadata.create_all(bind=engine, tables=TABLES, checkfirst=True)
    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_keyword_campaign_cycle_month "
                "ON keyword_campaign_cycles (cycle_year, cycle_month)"
            )
        )
        connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_geo_grid_scans_cycle_keyword_type "
                "ON geo_grid_scans (campaign_cycle_id, keyword, scan_type)"
            )
        )


def downgrade():
    with engine.begin() as connection:
        connection.execute(text("DROP INDEX IF EXISTS ix_geo_grid_scans_cycle_keyword_type"))
        connection.execute(text("DROP INDEX IF EXISTS ix_keyword_campaign_cycle_month"))
        for table in reversed(TABLES):
            table.drop(bind=connection, checkfirst=True)


if __name__ == "__main__":  # pragma: no cover
    upgrade()
