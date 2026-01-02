from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Iterable

from sqlalchemy.orm import Session

from backend.app.models.post_rotation_memory import PostRotationMemory


class RotationEngine:
    def __init__(self, db: Session, *, cooldown_hours: int = 72) -> None:
        self.db = db
        self.cooldown = timedelta(hours=cooldown_hours)

    def select_next(
        self, *, organization_id, location_id, key: str, candidates: Iterable[str]
    ) -> str | None:
        now = datetime.now(timezone.utc)
        memories = (
            self.db.query(PostRotationMemory)
            .filter(
                PostRotationMemory.organization_id == organization_id,
                PostRotationMemory.location_id == location_id,
                PostRotationMemory.key == key,
            )
            .order_by(PostRotationMemory.last_used_at.desc())
            .all()
        )
        cooldown_cutoff = now - self.cooldown
        recent = {memory.value for memory in memories if memory.last_used_at >= cooldown_cutoff}
        available = [value for value in candidates if value not in recent]
        choice = available[0] if available else (candidates[0] if candidates else None)
        if choice:
            memory = PostRotationMemory(
                organization_id=organization_id,
                location_id=location_id,
                key=key,
                value=choice,
                last_used_at=now,
            )
            self.db.add(memory)
            self.db.commit()
        return choice
