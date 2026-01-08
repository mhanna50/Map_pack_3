from __future__ import annotations

import random
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

    def choose_window(self, organization_id: uuid.UUID, location_id: uuid.UUID) -> dict[str, str]:
        stats = {
            stat.window_id: stat
            for stat in self.db.query(PostingWindowStat)
            .filter(
                PostingWindowStat.organization_id == organization_id,
                PostingWindowStat.location_id == location_id,
            )
            .all()
        }
        if not stats:
            return random.choice(POSTING_WINDOWS)
        sampled = []
        for window in POSTING_WINDOWS:
            stat = stats.get(window["id"])
            alpha = 1 + (stat.clicks + stat.conversions if stat else 0)
            impressions = stat.impressions if stat else 0
            beta = 1 + max(impressions - (stat.clicks if stat else 0), 0)
            sample = random.betavariate(alpha, beta)
            sampled.append((window, sample))
        sampled.sort(key=lambda item: item[1], reverse=True)
        return sampled[0][0]

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
        stat.impressions += impressions
        stat.clicks += clicks
        stat.conversions += conversions
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
