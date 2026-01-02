"""Set plan tier and usage limits for an organization.

Usage:
    python scripts/set_plan_tier.py <organization_id> <plan_tier> [posts_per_month] [locations]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from backend.app.db.session import SessionLocal
from backend.app.models.organization import Organization


def main() -> None:
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    org_id = sys.argv[1]
    plan = sys.argv[2]
    posts_limit = int(sys.argv[3]) if len(sys.argv) > 3 else 30
    locations_limit = int(sys.argv[4]) if len(sys.argv) > 4 else 5

    db = SessionLocal()
    try:
        org = db.get(Organization, org_id)
        if not org:
            raise SystemExit(f"Organization {org_id} not found")
        org.plan_tier = plan
        org.usage_limits_json = {
            "posts_per_month": posts_limit,
            "locations": locations_limit,
        }
        db.add(org)
        db.commit()
        print(
            json.dumps(
                {
                    "organization_id": org_id,
                    "plan_tier": org.plan_tier,
                    "usage_limits": org.usage_limits_json,
                },
                indent=2,
            )
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
