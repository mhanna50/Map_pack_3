from __future__ import annotations

from datetime import datetime, timezone, time
import uuid

from sqlalchemy.orm import Session

from backend.app.models.enums import PostStatus, PostType
from backend.app.models.post_candidate import PostCandidate
from backend.app.services.posts import PostService
from backend.app.services.posting_windows import PostingWindowService, POSTING_WINDOWS

WINDOW_RANGES = {
    "morning": (time(8, 0), time(10, 0)),
    "midday": (time(11, 0), time(13, 0)),
    "afternoon": (time(15, 0), time(17, 0)),
    "evening": (time(18, 0), time(20, 0)),
}


class PostSchedulerService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.window_service = PostingWindowService(db)
        self.post_service = PostService(db)

    def schedule(self, candidate_id: uuid.UUID) -> PostCandidate:
        candidate = self.db.get(PostCandidate, candidate_id)
        if not candidate:
            raise ValueError("Post candidate not found")
        if not candidate.proposed_caption:
            raise ValueError("Candidate missing composed caption")
        window = self.window_service.choose_window(candidate.organization_id, candidate.location_id)
        scheduled_time = self._resolve_datetime(candidate.candidate_date, window["id"])
        post = self.post_service.create_post(
            organization_id=candidate.organization_id,
            location_id=candidate.location_id,
            connected_account_id=None,
            post_type=PostType.UPDATE,
            base_prompt=candidate.proposed_caption,
            scheduled_at=scheduled_time,
            context=candidate.reason_json or {},
            bucket=candidate.bucket,
            topic_tags=[],
            media_asset_id=candidate.media_asset_id,
            window_id=window["id"],
        )
        candidate.status = PostStatus.SCHEDULED
        candidate.window_id = window["id"]
        self.db.add(candidate)
        self.db.commit()
        self.db.refresh(candidate)
        return candidate

    def _resolve_datetime(self, candidate_date, window_id: str) -> datetime:
        start, _ = WINDOW_RANGES.get(window_id, (time(9, 0), time(11, 0)))
        return datetime.combine(candidate_date, start, tzinfo=timezone.utc)
