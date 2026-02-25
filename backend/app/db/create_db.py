"""
Utility script to create all database tables defined in the SQLAlchemy models.
Run with: python -m backend.app.db.create_db
"""

import importlib
from pathlib import Path

from . import session  # noqa: F401
from ..models import *  # noqa
from .base import Base
from .session import engine


def _iter_migration_modules() -> list[str]:
    migrations_dir = Path(__file__).resolve().parent / "migrations"
    return [
        f"backend.app.db.migrations.{path.stem}"
        for path in sorted(migrations_dir.glob("[0-9][0-9][0-9][0-9]_*.py"))
    ]


def run_migrations() -> None:
    for module_path in _iter_migration_modules():
        module = importlib.import_module(module_path)
        upgrade = getattr(module, "upgrade", None)
        if callable(upgrade):
            upgrade()


def create_all():
    Base.metadata.create_all(bind=engine)
    run_migrations()


if __name__ == "__main__":
    create_all()
