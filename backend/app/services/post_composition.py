from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from backend.app.models.post_candidate import PostCandidate
from backend.app.services.seasonal import SeasonalPlanner

CTAS = [
    "Call today to schedule.",
    "Book your visit now.",
    "Send us a message to get started.",
    "Learn more on our site.",
]


class PostCompositionService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.seasonal = SeasonalPlanner()

    def compose(self, candidate_id: uuid.UUID, *, brand_voice: dict | None = None) -> PostCandidate:
        candidate = self.db.get(PostCandidate, candidate_id)
        if not candidate:
            raise ValueError("Post candidate not found")
        voice = brand_voice or {}
        tone = voice.get("tone", "friendly")
        city = self._location_city(candidate) or ""
        seasonal_hint = self.seasonal.seasonal_context(
            city,
            category=self._location_category(candidate),
            target_date=candidate.candidate_date,
        )
        base_prompt = self._prompt_for_bucket(candidate.bucket)
        body = (
            f"{seasonal_hint} {base_prompt} "
            f"Our team in {city or 'your area'} delivers reliable results with a {tone} touch."
        )
        cta = CTAS[hash(candidate.id) % len(CTAS)]
        caption = f"{body.strip()}\n\n{cta}"
        candidate.proposed_caption = caption
        self.db.add(candidate)
        self.db.commit()
        self.db.refresh(candidate)
        return candidate

    def _prompt_for_bucket(self, bucket: str | None) -> str:
        mapping = {
            "service_spotlight": "Highlight a key service and the value it delivers to homeowners.",
            "proof": "Share a before-and-after story that demonstrates trust.",
            "seasonal_tip": "Offer a timely seasonal tip related to maintenance.",
            "faq": "Answer a common customer question in clear terms.",
            "offer": "Describe a limited-time promotion with urgency.",
            "local_highlight": "Spotlight a local event or partnership.",
        }
        return mapping.get(bucket or "", "Share a helpful update for our clients.")

    @staticmethod
    def _location_city(candidate: PostCandidate) -> str | None:
        if candidate.location and candidate.location.address:
            address = candidate.location.address or {}
            return address.get("city") or address.get("locality")
        if candidate.location:
            return candidate.location.name
        return None

    @staticmethod
    def _location_category(candidate: PostCandidate) -> str | None:
        if candidate.location and candidate.location.address:
            address = candidate.location.address or {}
            category = address.get("category") or address.get("primaryCategory")
            if isinstance(category, str):
                return category.lower()
        return None
