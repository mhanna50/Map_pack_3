"""Add onboarding verification fields to lead recovery settings."""

from sqlalchemy import text

from backend.app.db.session import engine


def upgrade():
    with engine.begin() as connection:
        timestamp_type = "TIMESTAMP WITH TIME ZONE" if connection.dialect.name == "postgresql" else "DATETIME"

        statements = [
            "ALTER TABLE lead_recovery_settings ADD COLUMN IF NOT EXISTS business_name VARCHAR(255)",
            "ALTER TABLE lead_recovery_settings ADD COLUMN IF NOT EXISTS verification_status VARCHAR(32) NOT NULL DEFAULT 'not_started'",
            f"ALTER TABLE lead_recovery_settings ADD COLUMN IF NOT EXISTS last_verification_attempt_at {timestamp_type}",
            f"ALTER TABLE lead_recovery_settings ADD COLUMN IF NOT EXISTS verified_at {timestamp_type}",
            "ALTER TABLE lead_recovery_settings ADD COLUMN IF NOT EXISTS test_call_from_phone VARCHAR(32)",
            "ALTER TABLE lead_recovery_settings ADD COLUMN IF NOT EXISTS last_test_call_sid VARCHAR(128)",
            "ALTER TABLE lead_recovery_settings ADD COLUMN IF NOT EXISTS consent_confirmed BOOLEAN NOT NULL DEFAULT FALSE",
        ]
        for statement in statements:
            connection.execute(text(statement))


def downgrade():
    with engine.begin() as connection:
        for column in (
            "consent_confirmed",
            "last_test_call_sid",
            "test_call_from_phone",
            "verified_at",
            "last_verification_attempt_at",
            "verification_status",
            "business_name",
        ):
            connection.execute(text(f"ALTER TABLE lead_recovery_settings DROP COLUMN IF EXISTS {column}"))


if __name__ == "__main__":  # pragma: no cover
    upgrade()
