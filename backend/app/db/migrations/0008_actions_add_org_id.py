"""Add organization_id columns to core tables (actions, locations, connected_accounts)."""

from sqlalchemy import text

from backend.app.db.session import engine


def _add_column(connection, table: str):
    connection.execute(
        text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS organization_id UUID")
    )


def _backfill_from_self(connection, table: str):
    # Prefer existing tenant_id if present; it's the legacy column name.
    connection.execute(
        text(
            f"""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = '{table}'
                      AND column_name = 'tenant_id'
                ) THEN
                    UPDATE {table}
                    SET organization_id = tenant_id
                    WHERE organization_id IS NULL AND tenant_id IS NOT NULL;
                END IF;
            END $$;
            """
        )
    )


def _add_fk_and_index(connection, table: str):
    fk_name = f"{table}_organization_id_fkey"
    idx_name = f"ix_{table}_org"
    connection.execute(
        text(
            f"""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM information_schema.table_constraints
                    WHERE constraint_name = '{fk_name}'
                      AND table_name = '{table}'
                ) THEN
                    ALTER TABLE {table}
                    ADD CONSTRAINT {fk_name}
                    FOREIGN KEY (organization_id) REFERENCES organizations(id);
                END IF;
            END $$;
            """
        )
    )
    connection.execute(
        text(f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table} (organization_id)")
    )


def _enforce_not_null(connection, table: str):
    connection.execute(
        text(
            f"""
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM {table} WHERE organization_id IS NULL) THEN
                    ALTER TABLE {table} ALTER COLUMN organization_id SET NOT NULL;
                END IF;
            END $$;
            """
        )
    )


def upgrade():
    with engine.begin() as connection:
        for table in ("organizations", "locations", "connected_accounts", "actions"):
            # organizations table already has id; column add is harmless no-op for orgs
            _add_column(connection, table)
            _backfill_from_self(connection, table)

        # For actions, also backfill from related tables if still null
        connection.execute(
            text(
                """
                UPDATE actions a
                SET organization_id = l.organization_id
                FROM locations l
                WHERE a.organization_id IS NULL AND a.location_id = l.id
                """
            )
        )
        connection.execute(
            text(
                """
                UPDATE actions a
                SET organization_id = ca.organization_id
                FROM connected_accounts ca
                WHERE a.organization_id IS NULL AND a.connected_account_id = ca.id
                """
            )
        )

        for table in ("locations", "connected_accounts", "actions"):
            _add_fk_and_index(connection, table)
            _enforce_not_null(connection, table)


def downgrade():
    with engine.begin() as connection:
        for table in ("actions", "connected_accounts", "locations"):
            idx_name = f"ix_{table}_org"
            fk_name = f"{table}_organization_id_fkey"
            connection.execute(text(f"DROP INDEX IF EXISTS {idx_name}"))
            connection.execute(
                text(
                    f"""
                    DO $$
                    BEGIN
                        IF EXISTS (
                            SELECT 1
                            FROM information_schema.table_constraints
                            WHERE constraint_name = '{fk_name}'
                              AND table_name = '{table}'
                        ) THEN
                            ALTER TABLE {table} DROP CONSTRAINT {fk_name};
                        END IF;
                    END $$;
                    """
                )
            )
            connection.execute(text(f"ALTER TABLE {table} DROP COLUMN IF EXISTS organization_id"))


if __name__ == "__main__":
    upgrade()
