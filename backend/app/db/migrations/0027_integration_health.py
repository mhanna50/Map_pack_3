"""Add integration health and recovery tables."""

from sqlalchemy import text

from backend.app.db.session import engine


TABLES = (
    "client_reconnect_prompts",
    "integration_recovery_attempts",
    "integration_incidents",
    "integration_health_checks",
)


def upgrade():
    with engine.begin() as connection:
        uuid_type = "UUID" if connection.dialect.name == "postgresql" else "CHAR(32)"
        json_type = "JSONB" if connection.dialect.name == "postgresql" else "JSON"
        timestamp_type = "TIMESTAMP WITH TIME ZONE" if connection.dialect.name == "postgresql" else "DATETIME"
        now_expr = "now()" if connection.dialect.name == "postgresql" else "CURRENT_TIMESTAMP"

        connection.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS integration_health_checks (
                    id {uuid_type} PRIMARY KEY,
                    tenant_id {uuid_type} REFERENCES organizations(id),
                    integration VARCHAR(80) NOT NULL,
                    module VARCHAR(120),
                    status VARCHAR(32) NOT NULL,
                    severity VARCHAR(16) NOT NULL,
                    category VARCHAR(64),
                    message TEXT NOT NULL,
                    safe_details {json_type},
                    last_checked_at {timestamp_type},
                    last_success_at {timestamp_type},
                    last_failure_at {timestamp_type},
                    failure_count INTEGER NOT NULL DEFAULT 0,
                    recovery_attempt_count INTEGER NOT NULL DEFAULT 0,
                    next_retry_at {timestamp_type},
                    is_user_action_required BOOLEAN NOT NULL DEFAULT FALSE,
                    user_action_type VARCHAR(64),
                    admin_action_required BOOLEAN NOT NULL DEFAULT FALSE,
                    resolved_at {timestamp_type},
                    created_at {timestamp_type} NOT NULL DEFAULT {now_expr},
                    updated_at {timestamp_type} NOT NULL DEFAULT {now_expr},
                    CONSTRAINT uq_integration_health_scope UNIQUE (tenant_id, integration, module)
                )
                """
            )
        )
        connection.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS integration_incidents (
                    id {uuid_type} PRIMARY KEY,
                    tenant_id {uuid_type} REFERENCES organizations(id),
                    integration VARCHAR(80) NOT NULL,
                    module VARCHAR(120),
                    severity VARCHAR(16) NOT NULL,
                    category VARCHAR(64) NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    message TEXT NOT NULL,
                    safe_error_summary TEXT,
                    safe_details {json_type},
                    status VARCHAR(32) NOT NULL DEFAULT 'open',
                    first_seen_at {timestamp_type},
                    last_seen_at {timestamp_type},
                    resolved_at {timestamp_type},
                    recovery_attempts {json_type},
                    affected_count INTEGER NOT NULL DEFAULT 1,
                    created_at {timestamp_type} NOT NULL DEFAULT {now_expr},
                    updated_at {timestamp_type} NOT NULL DEFAULT {now_expr}
                )
                """
            )
        )
        connection.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS integration_recovery_attempts (
                    id {uuid_type} PRIMARY KEY,
                    tenant_id {uuid_type} REFERENCES organizations(id),
                    incident_id {uuid_type} REFERENCES integration_incidents(id),
                    integration VARCHAR(80) NOT NULL,
                    module VARCHAR(120),
                    action VARCHAR(128) NOT NULL,
                    status VARCHAR(32) NOT NULL,
                    message TEXT,
                    safe_details {json_type},
                    created_at {timestamp_type} NOT NULL DEFAULT {now_expr}
                )
                """
            )
        )
        connection.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS client_reconnect_prompts (
                    id {uuid_type} PRIMARY KEY,
                    tenant_id {uuid_type} NOT NULL REFERENCES organizations(id),
                    integration VARCHAR(80) NOT NULL,
                    module VARCHAR(120),
                    reason TEXT NOT NULL,
                    status VARCHAR(32) NOT NULL DEFAULT 'active',
                    action_url VARCHAR(255),
                    created_at {timestamp_type} NOT NULL DEFAULT {now_expr},
                    resolved_at {timestamp_type}
                )
                """
            )
        )
        for statement in (
            "CREATE INDEX IF NOT EXISTS ix_integration_health_checks_tenant ON integration_health_checks (tenant_id)",
            "CREATE INDEX IF NOT EXISTS ix_integration_health_checks_integration ON integration_health_checks (integration)",
            "CREATE INDEX IF NOT EXISTS ix_integration_health_checks_status ON integration_health_checks (status)",
            "CREATE INDEX IF NOT EXISTS ix_integration_health_checks_severity ON integration_health_checks (severity)",
            "CREATE INDEX IF NOT EXISTS ix_integration_health_checks_next_retry ON integration_health_checks (next_retry_at)",
            "CREATE INDEX IF NOT EXISTS ix_integration_incidents_tenant ON integration_incidents (tenant_id)",
            "CREATE INDEX IF NOT EXISTS ix_integration_incidents_integration ON integration_incidents (integration)",
            "CREATE INDEX IF NOT EXISTS ix_integration_incidents_status ON integration_incidents (status)",
            "CREATE INDEX IF NOT EXISTS ix_integration_incidents_severity ON integration_incidents (severity)",
            "CREATE INDEX IF NOT EXISTS ix_integration_recovery_attempts_incident ON integration_recovery_attempts (incident_id)",
            "CREATE INDEX IF NOT EXISTS ix_client_reconnect_prompts_tenant ON client_reconnect_prompts (tenant_id)",
            "CREATE INDEX IF NOT EXISTS ix_client_reconnect_prompts_status ON client_reconnect_prompts (status)",
        ):
            connection.execute(text(statement))

        if connection.dialect.name == "postgresql":
            for table in TABLES:
                connection.execute(text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
            for table in ("integration_health_checks", "client_reconnect_prompts"):
                connection.execute(
                    text(
                        f"""
                        DROP POLICY IF EXISTS tenant_read_own ON {table};
                        CREATE POLICY tenant_read_own ON {table}
                        FOR SELECT
                        USING (tenant_id = NULLIF(current_setting('app.current_org', true), '')::uuid);
                        """
                    )
                )
            for table in ("integration_incidents", "integration_recovery_attempts"):
                connection.execute(
                    text(
                        f"""
                        DROP POLICY IF EXISTS service_only ON {table};
                        CREATE POLICY service_only ON {table}
                        AS RESTRICTIVE
                        FOR ALL
                        USING (false)
                        WITH CHECK (false);
                        """
                    )
                )


def downgrade():
    with engine.begin() as connection:
        for table in TABLES:
            connection.execute(text(f"DROP TABLE IF EXISTS {table}"))


if __name__ == "__main__":  # pragma: no cover
    upgrade()
