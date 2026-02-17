"""Normalize action_status enum values to lowercase to match code."""

from sqlalchemy import text

from backend.app.db.session import engine


VALUES = [
    ("PENDING", "pending"),
    ("QUEUED", "queued"),
    ("RUNNING", "running"),
    ("SUCCEEDED", "succeeded"),
    ("FAILED", "failed"),
    ("DEAD_LETTERED", "dead_lettered"),
    ("CANCELLED", "cancelled"),
]


def _rename_enum_value(connection, old: str, new: str) -> None:
    """Rename an enum label only if the old label exists and the new one does not."""
    connection.execute(
        text(
            f"""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM pg_enum e
                    JOIN pg_type t ON e.enumtypid = t.oid
                    WHERE t.typname = 'action_status' AND e.enumlabel = '{old}'
                )
                AND NOT EXISTS (
                    SELECT 1
                    FROM pg_enum e
                    JOIN pg_type t ON e.enumtypid = t.oid
                    WHERE t.typname = 'action_status' AND e.enumlabel = '{new}'
                ) THEN
                    EXECUTE format('ALTER TYPE action_status RENAME VALUE %L TO %L', '{old}', '{new}');
                END IF;
            END $$;
            """
        )
    )


def upgrade():
    with engine.begin() as connection:
        for old, new in VALUES:
            _rename_enum_value(connection, old, new)


def downgrade():
    with engine.begin() as connection:
        # Reverse the mapping
        for new, old in VALUES:
            _rename_enum_value(connection, new, old)


if __name__ == "__main__":
    upgrade()
