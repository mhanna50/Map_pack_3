"""Create competitor monitoring tables."""

from backend.app.db.base import Base
from backend.app.db.session import engine
from backend.app.models.competitor_profile import CompetitorProfile
from backend.app.models.competitor_snapshot import CompetitorSnapshot


def upgrade():
    Base.metadata.create_all(  # ensure enums/types exist
        bind=engine,
        tables=[
            CompetitorProfile.__table__,
            CompetitorSnapshot.__table__,
        ],
        checkfirst=True,
    )


def downgrade():
    CompetitorSnapshot.__table__.drop(bind=engine, checkfirst=True)
    CompetitorProfile.__table__.drop(bind=engine, checkfirst=True)


if __name__ == "__main__":
    upgrade()
