"""Utility to run all built-in migrations sequentially."""

import importlib
import sys
from pathlib import Path

MIGRATIONS = [
    "backend.app.db.migrations.0004_competitors",
    "backend.app.db.migrations.0005_automation_rules",
    "backend.app.db.migrations.0006_approval_requests",
    "backend.app.db.migrations.0007_dashboard_and_plan",
    "backend.app.db.migrations.0008_actions_add_org_id",
    "backend.app.db.migrations.0009_action_status_lowercase",
]


def main() -> None:
    sys.path.append(str(Path(__file__).resolve().parents[1]))
    for module_path in MIGRATIONS:
        module = importlib.import_module(module_path)
        if hasattr(module, "upgrade"):
            print(f"Running migration {module_path}...")
            module.upgrade()
        else:
            raise RuntimeError(f"Migration {module_path} missing upgrade()")


if __name__ == "__main__":
    main()
