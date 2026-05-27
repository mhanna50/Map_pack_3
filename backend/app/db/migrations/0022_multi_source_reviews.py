"""Add provider metadata to reviews."""

from sqlalchemy import text

from backend.app.db.session import engine


REVIEW_PROVIDERS = (
    "google",
    "yelp",
    "facebook",
    "tripadvisor",
    "trustpilot",
    "bbb",
    "angi",
    "nextdoor",
    "healthgrades",
    "opentable",
)


def upgrade():
    with engine.begin() as connection:
        if connection.dialect.name == "postgresql":
            values = ", ".join(f"'{value}'" for value in REVIEW_PROVIDERS)
            connection.execute(text(f"DO $$ BEGIN CREATE TYPE review_provider AS ENUM ({values}); EXCEPTION WHEN duplicate_object THEN NULL; END $$;"))
            provider_type = "review_provider"
        else:
            provider_type = "VARCHAR(32)"

        connection.execute(
            text(
                f"ALTER TABLE reviews ADD COLUMN IF NOT EXISTS provider {provider_type} NOT NULL DEFAULT 'google'"
            )
        )
        connection.execute(text("ALTER TABLE reviews ADD COLUMN IF NOT EXISTS source_url VARCHAR"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_review_provider ON reviews (provider)"))
        connection.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_review_provider_external_id ON reviews (provider, external_review_id)"
            )
        )


def downgrade():
    with engine.begin() as connection:
        connection.execute(text("DROP INDEX IF EXISTS uq_review_provider_external_id"))
        connection.execute(text("DROP INDEX IF EXISTS ix_review_provider"))
        connection.execute(text("ALTER TABLE reviews DROP COLUMN IF EXISTS source_url"))
        connection.execute(text("ALTER TABLE reviews DROP COLUMN IF EXISTS provider"))
        if connection.dialect.name == "postgresql":
            connection.execute(text("DROP TYPE IF EXISTS review_provider"))


if __name__ == "__main__":  # pragma: no cover
    upgrade()
