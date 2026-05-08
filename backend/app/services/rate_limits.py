from __future__ import annotations

from datetime import datetime, timedelta, timezone
import uuid

from sqlalchemy.orm import Session

from backend.app.models.rate_limit_state import RateLimitState


class RateLimitError(Exception):
    """Raised when a scope is currently rate limited."""

    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__("Rate limit exceeded")
        self.retry_after_seconds = retry_after_seconds


class RateLimitService:
    """Simple token bucket per org/location to avoid hammering GBP APIs."""

    WINDOW_SECONDS = 3600

    def __init__(self, db: Session, *, limit_per_window: int = 200) -> None:
        self.db = db
        self.limit = limit_per_window

    def check_and_increment(
        self, *, organization_id: uuid.UUID, location_id: uuid.UUID | None, cost: int = 1
    ) -> RateLimitState:
        state = (
            self.db.query(RateLimitState)
            .filter(
                RateLimitState.organization_id == organization_id,
                RateLimitState.location_id == location_id,
            )
            .one_or_none()
        )
        state = self._normalize_state(state)
        now = datetime.now(timezone.utc)
        window_start = now.replace(minute=0, second=0, microsecond=0)
        window_end = window_start + timedelta(seconds=self.WINDOW_SECONDS)
        if not state:
            state = RateLimitState(
                organization_id=organization_id,
                location_id=location_id,
                window_starts_at=window_start,
                window_ends_at=window_end,
                limit=self.limit,
                used=0,
            )
        # reset window if expired
        if state.window_ends_at and state.window_ends_at <= now:
            state.window_starts_at = window_start
            state.window_ends_at = window_end
            state.used = 0
        if state.cooldown_until and state.cooldown_until > now:
            retry = int((state.cooldown_until - now).total_seconds())
            raise RateLimitError(retry)
        if state.used + cost > state.limit:
            state.cooldown_until = now + timedelta(seconds=300)
            self.db.add(state)
            self.db.commit()
            raise RateLimitError(300)
        state.used += cost
        self.db.add(state)
        self.db.commit()
        self.db.refresh(state)
        return state

    @staticmethod
    def _normalize_dt(dt: datetime | None) -> datetime | None:
        if dt and (dt.tzinfo is None or dt.tzinfo.utcoffset(dt) is None):
            return dt.replace(tzinfo=timezone.utc)
        return dt

    def _normalize_state(self, state: RateLimitState | None) -> RateLimitState | None:
        if not state:
            return state
        state.window_starts_at = self._normalize_dt(state.window_starts_at)
        state.window_ends_at = self._normalize_dt(state.window_ends_at)
        state.cooldown_until = self._normalize_dt(state.cooldown_until)
        return state
