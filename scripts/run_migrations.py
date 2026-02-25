"""Utility to run all built-in migrations sequentially."""

import importlib
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = PROJECT_ROOT / "backend" / "app" / "db" / "migrations"
MIGRATION_PACKAGE = "backend.app.db.migrations"


def iter_migrations() -> list[str]:
    return [
        f"{MIGRATION_PACKAGE}.{path.stem}"
        for path in sorted(MIGRATIONS_DIR.glob("[0-9][0-9][0-9][0-9]_*.py"))
    ]


def main() -> None:
    sys.path.append(str(PROJECT_ROOT))
    for module_path in iter_migrations():
        module = importlib.import_module(module_path)
        if hasattr(module, "upgrade"):
            print(f"Running migration {module_path}...")
            module.upgrade()
        else:
            raise RuntimeError(f"Migration {module_path} missing upgrade()")


if __name__ == "__main__":
    main()
