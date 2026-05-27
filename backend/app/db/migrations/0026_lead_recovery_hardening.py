"""Harden lead recovery indexes and Twilio idempotency constraints."""

from sqlalchemy import text

from backend.app.db.session import engine


def upgrade():
    with engine.begin() as connection:
        statements = [
            "CREATE INDEX IF NOT EXISTS ix_lead_recovery_settings_tenant ON lead_recovery_settings (tenant_id)",
            "CREATE INDEX IF NOT EXISTS ix_leads_created_at ON leads (created_at)",
            "CREATE INDEX IF NOT EXISTS ix_lead_messages_lead ON lead_messages (lead_id)",
        ]
        if connection.dialect.name == "postgresql":
            statements.extend(
                [
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_recovery_settings_twilio_phone_not_null ON lead_recovery_settings (twilio_phone_number) WHERE twilio_phone_number IS NOT NULL",
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_recovery_settings_twilio_sid_not_null ON lead_recovery_settings (twilio_phone_sid) WHERE twilio_phone_sid IS NOT NULL",
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_messages_twilio_sid_not_null ON lead_messages (twilio_message_sid) WHERE twilio_message_sid IS NOT NULL",
                ]
            )
        else:
            statements.extend(
                [
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_recovery_settings_twilio_phone_not_null ON lead_recovery_settings (twilio_phone_number)",
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_recovery_settings_twilio_sid_not_null ON lead_recovery_settings (twilio_phone_sid)",
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_messages_twilio_sid_not_null ON lead_messages (twilio_message_sid)",
                ]
            )

        for statement in statements:
            connection.execute(text(statement))


def downgrade():
    with engine.begin() as connection:
        for index in (
            "uq_lead_messages_twilio_sid_not_null",
            "uq_lead_recovery_settings_twilio_sid_not_null",
            "uq_lead_recovery_settings_twilio_phone_not_null",
            "ix_lead_messages_lead",
            "ix_leads_created_at",
            "ix_lead_recovery_settings_tenant",
        ):
            connection.execute(text(f"DROP INDEX IF EXISTS {index}"))


if __name__ == "__main__":  # pragma: no cover
    upgrade()
