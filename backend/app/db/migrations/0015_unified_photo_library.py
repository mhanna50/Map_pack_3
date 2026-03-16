"""Extend media assets for unified GBP + upload photo library."""

from sqlalchemy import text

from backend.app.db.session import engine


def upgrade():
    if engine.url.get_backend_name() != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(
            text(
                "ALTER TABLE media_assets "
                "ADD COLUMN IF NOT EXISTS source VARCHAR(32) NOT NULL DEFAULT 'upload'"
            )
        )
        connection.execute(
            text("ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS source_external_id VARCHAR(255)")
        )
        connection.execute(
            text(
                "ALTER TABLE media_assets "
                "ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0"
            )
        )
        connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_media_assets_location_source_last_used "
                "ON media_assets (location_id, source, last_used_at)"
            )
        )
        connection.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_media_assets_source_external "
                "ON media_assets (location_id, source, source_external_id) "
                "WHERE source_external_id IS NOT NULL"
            )
        )


def downgrade():
    if engine.url.get_backend_name() != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("DROP INDEX IF EXISTS uq_media_assets_source_external"))
        connection.execute(text("DROP INDEX IF EXISTS ix_media_assets_location_source_last_used"))
        connection.execute(text("ALTER TABLE media_assets DROP COLUMN IF EXISTS usage_count"))
        connection.execute(text("ALTER TABLE media_assets DROP COLUMN IF EXISTS source_external_id"))
        connection.execute(text("ALTER TABLE media_assets DROP COLUMN IF EXISTS source"))


if __name__ == "__main__":  # pragma: no cover
    upgrade()
