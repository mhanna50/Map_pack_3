"""Mark a user as staff (admin).

Usage:
    python scripts/set_staff_user.py <email> [true|false]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from backend.app.db.session import SessionLocal
from backend.app.models.user import User


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    email = sys.argv[1].lower()
    is_staff = True
    if len(sys.argv) > 2:
        is_staff = sys.argv[2].lower() in {"true", "1", "yes", "y"}

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).one_or_none()
        if not user:
            user = User(email=email, is_staff=is_staff)
            db.add(user)
        else:
            user.is_staff = is_staff
            db.add(user)
        db.commit()
        print(f"Updated {email}: is_staff={is_staff}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
