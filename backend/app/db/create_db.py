"""
Utility script to create all database tables defined in the SQLAlchemy models.
Run with: python -m backend.app.db.create_db
"""

from . import session  # noqa: F401
from ..models import *  # noqa
from .base import Base
from .session import engine


def create_all():
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    create_all()
