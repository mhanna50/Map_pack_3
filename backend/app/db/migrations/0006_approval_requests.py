"""Create approval request tables."""

from backend.app.db.base import Base
from backend.app.db.session import engine
from backend.app.models.approval_request import ApprovalRequest


def upgrade():
    Base.metadata.create_all(bind=engine, tables=[ApprovalRequest.__table__], checkfirst=True)


def downgrade():
    ApprovalRequest.__table__.drop(bind=engine, checkfirst=True)


if __name__ == "__main__":
    upgrade()
