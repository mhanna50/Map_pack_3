"""Add core tables for content planning, jobs, rate limits, photo requests."""

from sqlalchemy import text

from backend.app.db.base import Base
from backend.app.db.session import engine
from backend.app.models import (
    ContentItem,
    ContentPlan,
    PostJob,
    PostAttempt,
    RateLimitState,
    ClientUpload,
    PhotoRequest,
)


TABLES = [
    ContentItem.__table__,
    ContentPlan.__table__,
    PostJob.__table__,
    PostAttempt.__table__,
    RateLimitState.__table__,
    ClientUpload.__table__,
    PhotoRequest.__table__,
]


def upgrade():
    Base.metadata.create_all(bind=engine, tables=TABLES, checkfirst=True)
    # add helper indexes for run_at for jobs
    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_post_job_run_at ON post_jobs (run_at, status)"
            )
        )


def downgrade():
    with engine.begin() as connection:
        for table in reversed(TABLES):
            table.drop(bind=connection, checkfirst=True)


if __name__ == "__main__":  # pragma: no cover
    upgrade()
