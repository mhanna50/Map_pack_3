"""Add backend-used enum labels missing from older Supabase schemas."""

from sqlalchemy import text

from backend.app.db.session import engine


def upgrade():
    if engine.url.get_backend_name() != "postgresql":
        return

    with engine.begin() as connection:
        for value in ("run_keyword_campaign", "run_keyword_followup_scan"):
            connection.execute(text(f"ALTER TYPE action_type ADD VALUE IF NOT EXISTS '{value}'"))
        for value in ("running", "skipped", "succeeded", "rate_limited", "needs_client_input"):
            connection.execute(text(f"ALTER TYPE post_job_status ADD VALUE IF NOT EXISTS '{value}'"))


def downgrade():
    # PostgreSQL cannot drop enum labels without rebuilding the enum type.
    pass


if __name__ == "__main__":  # pragma: no cover
    upgrade()
