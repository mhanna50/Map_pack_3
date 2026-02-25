"""Backfill/rename legacy location columns to current naming."""

from sqlalchemy import text

from backend.app.db.session import engine


def _column_exists(connection, table: str, column: str) -> bool:
    return (
        connection.execute(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = :table
                  AND column_name = :column
                LIMIT 1
                """
            ),
            {"table": table, "column": column},
        ).scalar()
        is not None
    )


def upgrade():
    if engine.url.get_backend_name() != "postgresql":
        return

    with engine.begin() as connection:
        has_google_location_id = _column_exists(connection, "locations", "google_location_id")
        has_legacy_gbp_location_id = _column_exists(connection, "locations", "gbp_location_id")
        if not has_google_location_id and has_legacy_gbp_location_id:
            connection.execute(text("ALTER TABLE locations RENAME COLUMN gbp_location_id TO google_location_id"))
        elif not has_google_location_id:
            connection.execute(text("ALTER TABLE locations ADD COLUMN google_location_id VARCHAR(255)"))

        has_external_ids_json = _column_exists(connection, "locations", "external_ids_json")
        has_legacy_external_ids = _column_exists(connection, "locations", "external_ids")
        if not has_external_ids_json and has_legacy_external_ids:
            connection.execute(text("ALTER TABLE locations RENAME COLUMN external_ids TO external_ids_json"))
        elif not has_external_ids_json:
            connection.execute(text("ALTER TABLE locations ADD COLUMN external_ids_json JSONB"))

        connection.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM pg_indexes
                        WHERE schemaname = 'public'
                          AND tablename = 'locations'
                          AND indexdef ILIKE 'CREATE UNIQUE INDEX% (google_location_id)%'
                    )
                    AND NOT EXISTS (
                        SELECT 1
                        FROM locations
                        WHERE google_location_id IS NOT NULL
                        GROUP BY google_location_id
                        HAVING COUNT(*) > 1
                    ) THEN
                        CREATE UNIQUE INDEX ix_locations_google_location_id_unique
                        ON locations (google_location_id);
                    END IF;
                END $$;
                """
            )
        )


def downgrade():
    if engine.url.get_backend_name() != "postgresql":
        return

    with engine.begin() as connection:
        has_google_location_id = _column_exists(connection, "locations", "google_location_id")
        has_legacy_gbp_location_id = _column_exists(connection, "locations", "gbp_location_id")
        if has_google_location_id and not has_legacy_gbp_location_id:
            connection.execute(text("ALTER TABLE locations RENAME COLUMN google_location_id TO gbp_location_id"))

        has_external_ids_json = _column_exists(connection, "locations", "external_ids_json")
        has_legacy_external_ids = _column_exists(connection, "locations", "external_ids")
        if has_external_ids_json and not has_legacy_external_ids:
            connection.execute(text("ALTER TABLE locations RENAME COLUMN external_ids_json TO external_ids"))

        connection.execute(text("DROP INDEX IF EXISTS ix_locations_google_location_id_unique"))


if __name__ == "__main__":  # pragma: no cover
    upgrade()
