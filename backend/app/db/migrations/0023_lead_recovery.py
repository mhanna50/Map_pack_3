"""Add lead recovery settings and lead inbox tables."""

from sqlalchemy import text

from backend.app.db.session import engine


TABLES = ("lead_recovery_settings", "leads", "lead_messages", "lead_notes", "lead_events")


def upgrade():
    with engine.begin() as connection:
        uuid_type = "UUID" if connection.dialect.name == "postgresql" else "CHAR(32)"
        json_type = "JSONB" if connection.dialect.name == "postgresql" else "JSON"
        timestamp_type = "TIMESTAMP WITH TIME ZONE" if connection.dialect.name == "postgresql" else "DATETIME"
        now_expr = "now()" if connection.dialect.name == "postgresql" else "CURRENT_TIMESTAMP"

        connection.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS lead_recovery_settings (
                    id {uuid_type} PRIMARY KEY,
                    tenant_id {uuid_type} NOT NULL REFERENCES organizations(id),
                    enabled BOOLEAN NOT NULL DEFAULT FALSE,
                    business_phone VARCHAR(32),
                    owner_notification_phone VARCHAR(32),
                    owner_notification_email VARCHAR(320),
                    twilio_phone_number VARCHAR(32),
                    twilio_phone_sid VARCHAR(128),
                    forwarding_status VARCHAR(32) NOT NULL DEFAULT 'not_configured',
                    missed_call_textback_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                    intake_questions_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                    owner_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                    no_response_followup_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                    completed_job_review_request_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at {timestamp_type} NOT NULL DEFAULT {now_expr},
                    updated_at {timestamp_type} NOT NULL DEFAULT {now_expr},
                    CONSTRAINT uq_lead_recovery_settings_tenant UNIQUE (tenant_id)
                )
                """
            )
        )
        connection.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS leads (
                    id {uuid_type} PRIMARY KEY,
                    tenant_id {uuid_type} NOT NULL REFERENCES organizations(id),
                    source VARCHAR(32) NOT NULL DEFAULT 'missed_call',
                    customer_name VARCHAR(255),
                    customer_phone VARCHAR(32),
                    customer_email VARCHAR(320),
                    service_requested VARCHAR(255),
                    location VARCHAR(255),
                    urgency VARCHAR(120),
                    preferred_time VARCHAR(255),
                    details TEXT,
                    status VARCHAR(32) NOT NULL DEFAULT 'new',
                    owner_summary TEXT,
                    last_message_at {timestamp_type},
                    created_at {timestamp_type} NOT NULL DEFAULT {now_expr},
                    updated_at {timestamp_type} NOT NULL DEFAULT {now_expr}
                )
                """
            )
        )
        connection.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS lead_messages (
                    id {uuid_type} PRIMARY KEY,
                    tenant_id {uuid_type} NOT NULL REFERENCES organizations(id),
                    lead_id {uuid_type} NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
                    direction VARCHAR(24) NOT NULL,
                    channel VARCHAR(24) NOT NULL,
                    body TEXT,
                    twilio_message_sid VARCHAR(128),
                    created_at {timestamp_type} NOT NULL DEFAULT {now_expr}
                )
                """
            )
        )
        connection.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS lead_notes (
                    id {uuid_type} PRIMARY KEY,
                    tenant_id {uuid_type} NOT NULL REFERENCES organizations(id),
                    lead_id {uuid_type} NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
                    note TEXT NOT NULL,
                    created_by {uuid_type},
                    created_at {timestamp_type} NOT NULL DEFAULT {now_expr}
                )
                """
            )
        )
        connection.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS lead_events (
                    id {uuid_type} PRIMARY KEY,
                    tenant_id {uuid_type} NOT NULL REFERENCES organizations(id),
                    lead_id {uuid_type} REFERENCES leads(id) ON DELETE CASCADE,
                    event_type VARCHAR(64) NOT NULL,
                    payload_json {json_type},
                    created_at {timestamp_type} NOT NULL DEFAULT {now_expr}
                )
                """
            )
        )

        for statement in (
            "CREATE INDEX IF NOT EXISTS ix_lead_recovery_settings_twilio_phone ON lead_recovery_settings (twilio_phone_number)",
            "CREATE INDEX IF NOT EXISTS ix_lead_recovery_settings_twilio_sid ON lead_recovery_settings (twilio_phone_sid)",
            "CREATE INDEX IF NOT EXISTS ix_leads_tenant_status ON leads (tenant_id, status)",
            "CREATE INDEX IF NOT EXISTS ix_leads_tenant_phone ON leads (tenant_id, customer_phone)",
            "CREATE INDEX IF NOT EXISTS ix_lead_messages_tenant_lead ON lead_messages (tenant_id, lead_id)",
            "CREATE INDEX IF NOT EXISTS ix_lead_messages_twilio_sid ON lead_messages (twilio_message_sid)",
            "CREATE INDEX IF NOT EXISTS ix_lead_notes_tenant_lead ON lead_notes (tenant_id, lead_id)",
            "CREATE INDEX IF NOT EXISTS ix_lead_events_tenant_lead ON lead_events (tenant_id, lead_id)",
            "CREATE INDEX IF NOT EXISTS ix_lead_events_type ON lead_events (event_type)",
        ):
            connection.execute(text(statement))

        if connection.dialect.name == "postgresql":
            for table in TABLES:
                connection.execute(text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
                connection.execute(
                    text(
                        f"""
                        DROP POLICY IF EXISTS tenant_isolation ON {table};
                        CREATE POLICY tenant_isolation ON {table}
                        USING (tenant_id = current_setting('app.current_org', true)::uuid)
                        WITH CHECK (tenant_id = current_setting('app.current_org', true)::uuid);
                        """
                    )
                )


def downgrade():
    with engine.begin() as connection:
        for table in reversed(TABLES):
            if connection.dialect.name == "postgresql":
                connection.execute(text(f"DROP POLICY IF EXISTS tenant_isolation ON {table}"))
                connection.execute(text(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY"))
            connection.execute(text(f"DROP TABLE IF EXISTS {table}"))


if __name__ == "__main__":  # pragma: no cover
    upgrade()
