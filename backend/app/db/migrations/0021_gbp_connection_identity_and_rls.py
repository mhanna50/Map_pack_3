"""Tie GBP OAuth connections to users and harden token table access."""

from sqlalchemy import text

from backend.app.db.session import engine

revision = "0021_gbp_connection_identity_and_rls"
down_revision = "0020_gbp_audit_workflow"
branch_labels = None
depends_on = None


def upgrade():
    if engine.url.get_backend_name() != "postgresql":
        return

    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE connected_accounts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id)"))
        connection.execute(text("ALTER TABLE gbp_connections ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id)"))
        connection.execute(text("ALTER TABLE gbp_connections ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_connected_accounts_user_id ON connected_accounts (user_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_gbp_connections_user_id ON gbp_connections (user_id)"))

        connection.execute(text("ALTER TABLE connected_accounts ENABLE ROW LEVEL SECURITY"))
        connection.execute(text("ALTER TABLE gbp_connections ENABLE ROW LEVEL SECURITY"))
        connection.execute(
            text(
                """
                DROP POLICY IF EXISTS connected_accounts_select_member ON connected_accounts;
                CREATE POLICY connected_accounts_select_member
                ON connected_accounts
                FOR SELECT
                TO authenticated
                USING (
                    tenant_id = NULLIF(current_setting('app.current_org', true), '')::uuid
                );

                DROP POLICY IF EXISTS gbp_connections_select_member ON gbp_connections;
                CREATE POLICY gbp_connections_select_member
                ON gbp_connections
                FOR SELECT
                TO authenticated
                USING (
                    tenant_id = NULLIF(current_setting('app.current_org', true), '')::uuid
                );
                """
            )
        )

        connection.execute(text("REVOKE ALL ON connected_accounts FROM anon"))
        connection.execute(text("REVOKE ALL ON gbp_connections FROM anon"))
        connection.execute(text("REVOKE SELECT ON connected_accounts FROM authenticated"))
        connection.execute(text("REVOKE SELECT ON gbp_connections FROM authenticated"))
        connection.execute(
            text(
                """
                GRANT SELECT (
                    id,
                    tenant_id,
                    organization_id,
                    user_id,
                    provider,
                    external_account_id,
                    display_name,
                    scopes,
                    access_token_expires_at,
                    metadata_json,
                    created_at,
                    updated_at
                ) ON connected_accounts TO authenticated;

                GRANT SELECT (
                    id,
                    tenant_id,
                    user_id,
                    google_account_email,
                    account_resource_name,
                    scopes,
                    status,
                    access_token_expires_at,
                    last_sync_at,
                    metadata_json,
                    created_at,
                    updated_at
                ) ON gbp_connections TO authenticated;
                """
            )
        )


def downgrade():
    if engine.url.get_backend_name() != "postgresql":
        return

    with engine.begin() as connection:
        connection.execute(text("DROP POLICY IF EXISTS connected_accounts_select_member ON connected_accounts"))
        connection.execute(text("DROP POLICY IF EXISTS gbp_connections_select_member ON gbp_connections"))
        connection.execute(text("DROP INDEX IF EXISTS ix_connected_accounts_user_id"))
        connection.execute(text("DROP INDEX IF EXISTS ix_gbp_connections_user_id"))


if __name__ == "__main__":  # pragma: no cover
    upgrade()
