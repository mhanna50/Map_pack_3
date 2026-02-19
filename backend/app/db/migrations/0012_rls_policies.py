"""Enable RLS and add org-scoped policies for multi-tenant safety."""

from sqlalchemy import text

from backend.app.db.session import engine

TABLES = [
    "actions",
    "posts",
    "locations",
    "content_plans",
    "content_items",
    "post_jobs",
    "post_attempts",
    "rate_limit_state",
    "media_assets",
    "alerts",
    "audit_logs",
]


def upgrade():
    if engine.url.get_backend_name() != "postgresql":
        return
    with engine.begin() as connection:
        for table in TABLES:
            connection.execute(text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
            connection.execute(
                text(
                    f"""
                    DROP POLICY IF EXISTS org_isolation ON {table};
                    CREATE POLICY org_isolation ON {table}
                    USING (
                        organization_id IS NULL
                        OR organization_id = current_setting('app.current_org')::uuid
                    );
                    """
                )
            )


def downgrade():
    if engine.url.get_backend_name() != "postgresql":
        return
    with engine.begin() as connection:
        for table in TABLES:
            connection.execute(text(f"DROP POLICY IF EXISTS org_isolation ON {table}"))
            connection.execute(text(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY"))


if __name__ == "__main__":  # pragma: no cover
    upgrade()
