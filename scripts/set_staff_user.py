"""Mark a user as staff (admin).

Usage:
    python scripts/set_staff_user.py <email> [true|false]
"""

from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import text

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
        auth_user_id = db.execute(
            text("select id from auth.users where lower(email) = :email limit 1"),
            {"email": email},
        ).scalar_one_or_none()

        user = None
        if auth_user_id:
            user = db.query(User).filter(User.id == auth_user_id).one_or_none()
        if not user:
            user = db.query(User).filter(User.email == email).one_or_none()

        if not user:
            user = User(id=auth_user_id, email=email, is_staff=is_staff) if auth_user_id else User(
                email=email,
                is_staff=is_staff,
            )
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
