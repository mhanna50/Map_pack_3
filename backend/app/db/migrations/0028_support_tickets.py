"""Add client support tickets table."""

from sqlalchemy import text

from backend.app.db.session import engine


def upgrade():
    with engine.begin() as connection:
        uuid_type = "UUID" if connection.dialect.name == "postgresql" else "CHAR(32)"
        timestamp_type = "TIMESTAMP WITH TIME ZONE" if connection.dialect.name == "postgresql" else "DATETIME"
        now_expr = "now()" if connection.dialect.name == "postgresql" else "CURRENT_TIMESTAMP"
        connection.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS support_tickets (
                    id {uuid_type} PRIMARY KEY,
                    tenant_id {uuid_type} NOT NULL REFERENCES organizations(id),
                    subject VARCHAR(255) NOT NULL,
                    description TEXT,
                    status VARCHAR(32) NOT NULL DEFAULT 'open',
                    created_at {timestamp_type} NOT NULL DEFAULT {now_expr},
                    updated_at {timestamp_type} NOT NULL DEFAULT {now_expr}
                )
                """
            )
        )
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_support_tickets_tenant ON support_tickets (tenant_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_support_tickets_status ON support_tickets (status)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_support_tickets_created_at ON support_tickets (created_at)"))
        if connection.dialect.name == "postgresql":
            connection.execute(text("ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY"))
            connection.execute(
                text(
                    """
                    DROP POLICY IF EXISTS support_tickets_select_member ON support_tickets;
                    CREATE POLICY support_tickets_select_member
                    ON support_tickets
                    FOR SELECT
                    USING (tenant_id = NULLIF(current_setting('app.current_org', true), '')::uuid);
                    """
                )
            )


def downgrade():
    with engine.begin() as connection:
        if connection.dialect.name == "postgresql":
            connection.execute(text("DROP POLICY IF EXISTS support_tickets_select_member ON support_tickets"))
        connection.execute(text("DROP TABLE IF EXISTS support_tickets"))


if __name__ == "__main__":  # pragma: no cover
    upgrade()
