"""Add admin monitoring activity, notes, and impersonation audit tables."""

from sqlalchemy import text

from backend.app.db.session import engine


TABLES = ("client_activity_events", "admin_client_notes", "admin_impersonation_audit")


def upgrade():
    with engine.begin() as connection:
        uuid_type = "UUID" if connection.dialect.name == "postgresql" else "CHAR(32)"
        json_type = "JSONB" if connection.dialect.name == "postgresql" else "JSON"
        timestamp_type = "TIMESTAMP WITH TIME ZONE" if connection.dialect.name == "postgresql" else "DATETIME"
        now_expr = "now()" if connection.dialect.name == "postgresql" else "CURRENT_TIMESTAMP"

        connection.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS client_activity_events (
                    id {uuid_type} PRIMARY KEY,
                    tenant_id {uuid_type} NOT NULL REFERENCES organizations(id),
                    module VARCHAR(64) NOT NULL,
                    event_type VARCHAR(128) NOT NULL,
                    status VARCHAR(32),
                    title VARCHAR(255),
                    description TEXT,
                    metadata_json {json_type},
                    created_at {timestamp_type} NOT NULL DEFAULT {now_expr}
                )
                """
            )
        )
        connection.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS admin_client_notes (
                    id {uuid_type} PRIMARY KEY,
                    tenant_id {uuid_type} NOT NULL REFERENCES organizations(id),
                    note TEXT NOT NULL,
                    created_by {uuid_type},
                    pinned BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at {timestamp_type} NOT NULL DEFAULT {now_expr},
                    updated_at {timestamp_type} NOT NULL DEFAULT {now_expr}
                )
                """
            )
        )
        connection.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS admin_impersonation_audit (
                    id {uuid_type} PRIMARY KEY,
                    admin_user_id {uuid_type} NOT NULL,
                    target_user_id {uuid_type},
                    tenant_id {uuid_type} NOT NULL REFERENCES organizations(id),
                    action VARCHAR(32) NOT NULL,
                    metadata_json {json_type},
                    created_at {timestamp_type} NOT NULL DEFAULT {now_expr}
                )
                """
            )
        )

        for statement in (
            "CREATE INDEX IF NOT EXISTS ix_client_activity_events_tenant_module ON client_activity_events (tenant_id, module)",
            "CREATE INDEX IF NOT EXISTS ix_client_activity_events_created_at ON client_activity_events (created_at)",
            "CREATE INDEX IF NOT EXISTS ix_admin_client_notes_tenant ON admin_client_notes (tenant_id)",
            "CREATE INDEX IF NOT EXISTS ix_admin_impersonation_audit_tenant ON admin_impersonation_audit (tenant_id)",
            "CREATE INDEX IF NOT EXISTS ix_admin_impersonation_audit_admin ON admin_impersonation_audit (admin_user_id)",
        ):
            connection.execute(text(statement))

        if connection.dialect.name == "postgresql":
            for table in ("client_activity_events", "admin_client_notes"):
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
            connection.execute(text("ALTER TABLE admin_impersonation_audit ENABLE ROW LEVEL SECURITY"))


def downgrade():
    with engine.begin() as connection:
        for table in reversed(TABLES):
            if connection.dialect.name == "postgresql":
                connection.execute(text(f"DROP POLICY IF EXISTS tenant_isolation ON {table}"))
                connection.execute(text(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY"))
            connection.execute(text(f"DROP TABLE IF EXISTS {table}"))


if __name__ == "__main__":  # pragma: no cover
    upgrade()
