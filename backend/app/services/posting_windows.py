from __future__ import annotations

import random
from datetime import time
from zoneinfo import ZoneInfo
import uuid

from sqlalchemy.orm import Session

from backend.app.models.posting_window_stat import PostingWindowStat

POSTING_WINDOWS = [
    {"id": "morning", "label": "8-10am"},
    {"id": "midday", "label": "11-1pm"},
    {"id": "afternoon", "label": "3-5pm"},
    {"id": "evening", "label": "6-8pm"},
]


class PostingWindowService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def choose_window(
        self,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        *,
        business_hours: dict | None = None,
        timezone_name: str | None = None,
        target_date=None,
    ) -> dict[str, str]:
        stats = {
            stat.window_id: stat
            for stat in self.db.query(PostingWindowStat)
            .filter(
                PostingWindowStat.organization_id == organization_id,
                PostingWindowStat.location_id == location_id,
            )
            .all()
        }
        windows = self._filter_by_business_hours(business_hours, timezone_name, target_date)
        if not stats:
            return random.choice(windows)
        sampled = []
        for window in windows:
            stat = stats.get(window["id"])
            if not stat:
                sample = random.betavariate(1, 3)  # modest prior so known performers win
            else:
                alpha = 1 + (stat.clicks + stat.conversions)
                impressions = stat.impressions
                beta = 1 + max(impressions - stat.clicks, 0)
                sample = random.betavariate(alpha, beta)
            sampled.append((window, sample))
        sampled.sort(key=lambda item: item[1], reverse=True)
        return sampled[0][0]

    @staticmethod
    def _filter_by_business_hours(business_hours: dict | None, timezone_name: str | None, target_date=None) -> list[dict[str, str]]:
        if not business_hours or not timezone_name:
            return POSTING_WINDOWS
        tz = ZoneInfo(timezone_name)
        filtered: list[dict[str, str]] = []
        if not isinstance(business_hours, dict):
            return POSTING_WINDOWS
        weekday = (target_date.weekday() if target_date else 0)
        weekday_key = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"][weekday]
        hours = business_hours.get(weekday_key) or business_hours.get("mon")
        if not (isinstance(hours, (list, tuple)) and len(hours) == 2):
            return POSTING_WINDOWS
        open_h, open_m = map(int, hours[0].split(":"))
        close_h, close_m = map(int, hours[1].split(":"))
        open_time = time(hour=open_h, minute=open_m, tzinfo=tz)
        close_time = time(hour=close_h, minute=close_m, tzinfo=tz)
        window_map = {
            "morning": (8, 0),
            "midday": (11, 0),
            "afternoon": (15, 0),
            "evening": (18, 0),
        }
        for window in POSTING_WINDOWS:
            w_start = window_map.get(window["id"], (9, 0))
            start_local = time(hour=w_start[0], minute=w_start[1], tzinfo=tz)
            if open_time <= start_local <= close_time:
                filtered.append(window)
        return filtered or POSTING_WINDOWS

    def record_result(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        window_id: str,
        impressions: int,
        clicks: int,
        conversions: int,
    ) -> PostingWindowStat:
        stat = (
            self.db.query(PostingWindowStat)
            .filter(
                PostingWindowStat.organization_id == organization_id,
                PostingWindowStat.location_id == location_id,
                PostingWindowStat.window_id == window_id,
            )
            .one_or_none()
        )
        if not stat:
            stat = PostingWindowStat(
                organization_id=organization_id,
                location_id=location_id,
                window_id=window_id,
            )
            stat.impressions = 0
            stat.clicks = 0
            stat.conversions = 0
        stat.impressions = (stat.impressions or 0) + impressions
        stat.clicks = (stat.clicks or 0) + clicks
        stat.conversions = (stat.conversions or 0) + conversions
        self.db.add(stat)
        self.db.commit()
        self.db.refresh(stat)
        return stat

    @staticmethod
    def _performance(stat: PostingWindowStat | None) -> float:
        if not stat or stat.impressions == 0:
            return 0.0
        ctr = stat.clicks / max(stat.impressions, 1)
        cr = stat.conversions / max(stat.clicks, 1)
        return ctr * 0.7 + cr * 0.3
