"""Hierarchical settings, content fingerprints, and org-level settings."""

from sqlalchemy import text

from backend.app.db.base import Base
from backend.app.db.session import engine
from backend.app.models import OrgSettings


def upgrade():
    OrgSettings.__table__.create(bind=engine, checkfirst=True)
    with engine.begin() as connection:
        connection.execute(
            text("ALTER TABLE location_settings ADD COLUMN IF NOT EXISTS settings_json JSONB DEFAULT '{}'::jsonb")
        )
        connection.execute(
            text("ALTER TABLE posts ADD COLUMN IF NOT EXISTS fingerprint VARCHAR(255)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_post_fingerprint ON posts (fingerprint)")
        )
        connection.execute(
            text("ALTER TABLE post_candidates ADD COLUMN IF NOT EXISTS fingerprint VARCHAR(255)")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_post_candidate_fingerprint ON post_candidates (fingerprint)")
        )


def downgrade():
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE location_settings DROP COLUMN IF EXISTS settings_json"))
        connection.execute(text("DROP INDEX IF EXISTS ix_post_fingerprint"))
        connection.execute(text("ALTER TABLE posts DROP COLUMN IF EXISTS fingerprint"))
        connection.execute(text("DROP INDEX IF EXISTS ix_post_candidate_fingerprint"))
        connection.execute(text("ALTER TABLE post_candidates DROP COLUMN IF EXISTS fingerprint"))
    OrgSettings.__table__.drop(bind=engine, checkfirst=True)


if __name__ == "__main__":  # pragma: no cover
    upgrade()
