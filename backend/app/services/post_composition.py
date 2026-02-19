from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from backend.app.models.post_candidate import PostCandidate
from backend.app.services.seasonal import SeasonalPlanner
from backend.app.services.settings import SettingsService
from backend.app.core.config import settings
import httpx
import math
from backend.app.models.post import Post
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher

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
        self.settings = SettingsService(db)

    def compose(self, candidate_id: uuid.UUID, *, brand_voice: dict | None = None) -> PostCandidate:
        candidate = self.db.get(PostCandidate, candidate_id)
        if not candidate:
            raise ValueError("Post candidate not found")
        settings = self.settings.merged(candidate.organization_id, candidate.location_id)
        voice = brand_voice or {}
        tone = voice.get("tone", settings.get("tone_of_voice", "friendly"))
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
        if self._is_similar_to_recent(caption, candidate.location_id):
            raise ValueError("Caption too similar to recent content")
        candidate.proposed_caption = caption
        candidate.fingerprint = self._fingerprint(caption)
        embedding = self._embedding(caption)
        reason = dict(candidate.reason_json or {})
        if embedding:
            reason["embedding"] = embedding
        candidate.reason_json = reason
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
    def _fingerprint(text: str) -> str:
        import hashlib
        normalized = " ".join(text.lower().split())
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:32]

    def _is_similar_to_recent(self, caption: str, location_id: uuid.UUID, days: int = 45, threshold: float = 0.9) -> bool:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        recent_posts = (
            self.db.query(Post)
            .filter(Post.location_id == location_id)
            .filter(Post.created_at >= cutoff)
            .all()
        )
        for post in recent_posts:
            if not post.body:
                continue
            post_embed = None
            if post.ai_prompt_context:
                post_embed = post.ai_prompt_context.get("embedding")
            score = SequenceMatcher(None, caption.lower(), post.body.lower()).ratio()
            if post_embed and self._embedding_sim(post_embed, caption):
                return True
            if score >= threshold:
                return True
        return False

    def _embedding(self, text: str) -> list[float] | None:
        api_key = settings.OPENAI_API_KEY
        if not api_key:
            return None
        try:
            payload = {"input": text, "model": "text-embedding-3-small"}
            headers = {"Authorization": f"Bearer {api_key}"}
            with httpx.Client(timeout=10.0) as client:
                resp = client.post("https://api.openai.com/v1/embeddings", json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
            return data["data"][0]["embedding"]
        except Exception:
            return None

    def _embedding_sim(self, stored_embedding: list[float], caption: str, threshold: float = 0.90) -> bool:
        new_embedding = self._embedding(caption)
        if not new_embedding or not stored_embedding:
            return False
        # cosine similarity
        dot = sum(a * b for a, b in zip(stored_embedding, new_embedding))
        norm_a = math.sqrt(sum(a * a for a in stored_embedding))
        norm_b = math.sqrt(sum(b * b for b in new_embedding))
        if not norm_a or not norm_b:
            return False
        sim = dot / (norm_a * norm_b)
        return sim >= threshold

    @staticmethod
    def _location_category(candidate: PostCandidate) -> str | None:
        if candidate.location and candidate.location.address:
            address = candidate.location.address or {}
            category = address.get("category") or address.get("primaryCategory")
            if isinstance(category, str):
                return category.lower()
        return None
