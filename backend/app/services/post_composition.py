from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from difflib import SequenceMatcher
import math
import uuid

import httpx
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.models.brand_voice import BrandVoice
from backend.app.models.enums import PostType
from backend.app.models.post import Post
from backend.app.models.post_candidate import PostCandidate
from backend.app.services.content_guardrails import ContentGuardrails
from backend.app.services.gbp_sync import GbpSyncService
from backend.app.services.media_selection import MediaSelector
from backend.app.services.rotation import RotationEngine
from backend.app.services.settings import SettingsService

CTAS = [
    "Call today to schedule a consultation.",
    "Contact us today to book service.",
    "Message our team to get started.",
    "Reach out now to plan your next service visit.",
]

ANGLES = [
    "service_highlight",
    "educational",
    "seasonal_reminder",
    "maintenance_guidance",
    "credibility",
]

TONE_INSTRUCTIONS = {
    "friendly": "Warm, approachable, and helpful.",
    "professional": "Clear, confident, and informative.",
    "bold": "Direct, energetic, and assertive without exaggeration.",
    "concise": "Short sentences and plain language.",
}


class PostCompositionService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.settings = SettingsService(db)
        self.rotation = RotationEngine(db)
        self.media_selector = MediaSelector(db)
        self.guardrails = ContentGuardrails()
        self.gbp_sync = GbpSyncService(db)

    def compose(self, candidate_id: uuid.UUID, *, brand_voice: dict | None = None) -> PostCandidate:
        candidate = self.db.get(PostCandidate, candidate_id)
        if not candidate:
            raise ValueError("Post candidate not found")
        if not candidate.location:
            raise ValueError("Candidate is missing location context")

        merged = self.settings.merged(candidate.organization_id, candidate.location_id)
        offers = self.settings.verified_offers(candidate.organization_id, candidate.location_id)
        events = self.settings.verified_events(candidate.organization_id, candidate.location_id)
        post_type = self._post_type(candidate, offers=offers, events=events)
        tone = self._tone(candidate.organization_id, merged, override=brand_voice)
        service_name = self._rotate_service(candidate)
        angle = self._rotate_angle(candidate)
        cta = self._rotate_cta(candidate)
        location_text = self._location_text(candidate)
        category = self._location_category(candidate)
        seasonal_hint = self._seasonal_hint(candidate.candidate_date)
        offer_context = offers[0] if offers else None
        event_context = events[0] if events else None

        # Best effort GBP media import so existing GBP photos share the same local media pool.
        self._sync_gbp_media_best_effort(candidate)
        media = self.media_selector.pick_asset(
            location_id=candidate.location_id,
            service=service_name,
            theme=angle,
            prefer_upload=True,
            min_reuse_gap_days=int(merged.get("photo_reuse_gap_days", 14)),
            mark_used=False,
        )

        generated = self._generate_caption_openai(
            business_name=candidate.location.name,
            category=category,
            service_name=service_name,
            location_text=location_text,
            seasonal_hint=seasonal_hint,
            angle=angle,
            tone=tone,
            cta=cta,
            post_type=post_type,
            offer_context=offer_context,
            event_context=event_context,
            media_tags=list(media.categories or []) if media else [],
        )
        caption = generated or self._fallback_caption(
            post_type=post_type,
            business_name=candidate.location.name,
            category=category,
            service_name=service_name,
            location_text=location_text,
            seasonal_hint=seasonal_hint,
            angle=angle,
            tone=tone,
            cta=cta,
            offer_context=offer_context,
            event_context=event_context,
        )

        recent_bodies = self._recent_bodies(candidate.location_id)
        errors = self.guardrails.validate(
            caption,
            post_type=post_type,
            service=service_name,
            location=location_text,
            has_verified_offer=bool(offers),
            has_verified_event=bool(events),
            recent_texts=recent_bodies,
            require_cta=True,
        )
        if errors:
            safe_fallback = self._fallback_caption(
                post_type=PostType.UPDATE if post_type != PostType.UPDATE else post_type,
                business_name=candidate.location.name,
                category=category,
                service_name=service_name,
                location_text=location_text,
                seasonal_hint=seasonal_hint,
                angle=angle,
                tone=tone,
                cta=cta,
                offer_context=offer_context,
                event_context=event_context,
            )
            fallback_errors = self.guardrails.validate(
                safe_fallback,
                post_type=PostType.UPDATE if post_type != PostType.UPDATE else post_type,
                service=service_name,
                location=location_text,
                has_verified_offer=bool(offers),
                has_verified_event=bool(events),
                recent_texts=recent_bodies,
                require_cta=True,
            )
            if fallback_errors:
                raise ValueError(f"Generated caption failed guardrails: {errors}")
            caption = safe_fallback
            post_type = PostType.UPDATE if post_type != PostType.UPDATE else post_type

        if self._is_similar_to_recent(caption, candidate.location_id):
            raise ValueError("Caption too similar to recent content")

        candidate.proposed_caption = caption
        candidate.media_asset_id = media.id if media else None
        candidate.fingerprint = self._fingerprint(caption)
        reason = dict(candidate.reason_json or {})
        reason.update(
            {
                "post_type": post_type.value,
                "angle": angle,
                "service": service_name,
                "cta": cta,
                "tone": tone,
                "location_text": location_text,
                "business_category": category,
                "photo_source": media.source if media else None,
                "photo_id": str(media.id) if media else None,
                "offer_context": offer_context,
                "event_context": event_context,
            }
        )
        embedding = self._embedding(caption)
        if embedding:
            reason["embedding"] = embedding
        candidate.reason_json = reason
        self.db.add(candidate)
        self.db.commit()
        self.db.refresh(candidate)
        return candidate

    def _post_type(
        self,
        candidate: PostCandidate,
        *,
        offers: list[dict],
        events: list[dict],
    ) -> PostType:
        reason = candidate.reason_json or {}
        hint = str(reason.get("post_type_hint") or "").lower()
        if candidate.bucket == "offer" and offers:
            return PostType.OFFER
        if hint == "event" and events:
            return PostType.EVENT
        if candidate.bucket == "local_highlight" and events:
            return PostType.EVENT
        return PostType.UPDATE

    def _rotate_service(self, candidate: PostCandidate) -> str:
        candidates = self._service_candidates(candidate)
        selected = self.rotation.select_next(
            organization_id=candidate.organization_id,
            location_id=candidate.location_id,
            key="service",
            candidates=candidates,
        )
        return selected or candidates[0]

    def _rotate_angle(self, candidate: PostCandidate) -> str:
        selected = self.rotation.select_next(
            organization_id=candidate.organization_id,
            location_id=candidate.location_id,
            key="angle",
            candidates=ANGLES,
        )
        return selected or ANGLES[0]

    def _rotate_cta(self, candidate: PostCandidate) -> str:
        selected = self.rotation.select_next(
            organization_id=candidate.organization_id,
            location_id=candidate.location_id,
            key="cta",
            candidates=CTAS,
        )
        return selected or CTAS[0]

    def _service_candidates(self, candidate: PostCandidate) -> list[str]:
        values: list[str] = []
        if candidate.location and candidate.location.settings and candidate.location.settings.services:
            for entry in candidate.location.settings.services:
                if isinstance(entry, str):
                    values.append(entry)
                elif isinstance(entry, dict):
                    label = entry.get("name") or entry.get("title") or entry.get("service")
                    if isinstance(label, str):
                        values.append(label)
        if candidate.location and candidate.location.settings and candidate.location.settings.keywords:
            for keyword in candidate.location.settings.keywords:
                if isinstance(keyword, str):
                    values.append(keyword)
        if not values and candidate.location and candidate.location.address:
            address = candidate.location.address or {}
            category = address.get("category") or address.get("primaryCategory")
            if isinstance(category, str) and category.strip():
                values.append(category.strip())
        if not values:
            values.append("local business services")
        deduped: list[str] = []
        for value in values:
            normalized = " ".join(str(value).split())
            if normalized and normalized not in deduped:
                deduped.append(normalized)
        return deduped

    def _tone(self, organization_id: uuid.UUID, merged_settings: dict, *, override: dict | None) -> str:
        if override and isinstance(override.get("tone"), str):
            tone = override["tone"].strip().lower()
            if tone in TONE_INSTRUCTIONS:
                return tone
        voice = self.db.query(BrandVoice).filter(BrandVoice.organization_id == organization_id).one_or_none()
        if voice and voice.tone and voice.tone.lower() in TONE_INSTRUCTIONS:
            return voice.tone.lower()
        configured = str(merged_settings.get("tone_of_voice", "friendly")).lower()
        return configured if configured in TONE_INSTRUCTIONS else "friendly"

    @staticmethod
    def _location_text(candidate: PostCandidate) -> str:
        if candidate.location and candidate.location.address:
            address = candidate.location.address or {}
            city = address.get("city") or address.get("locality")
            region = address.get("state") or address.get("administrativeArea")
            if city and region:
                return f"{city}, {region}"
            if city:
                return str(city)
        return candidate.location.name if candidate.location else "your area"

    @staticmethod
    def _location_category(candidate: PostCandidate) -> str:
        if candidate.location and candidate.location.address:
            address = candidate.location.address or {}
            category = address.get("category") or address.get("primaryCategory")
            if isinstance(category, str) and category.strip():
                return category.strip()
        return "service provider"

    @staticmethod
    def _seasonal_hint(target_date: date) -> str:
        month = target_date.month
        if month in {12, 1, 2}:
            return "winter is a good time for proactive maintenance"
        if month in {3, 4, 5}:
            return "spring is a smart season to inspect and prepare"
        if month in {6, 7, 8}:
            return "summer demand can increase quickly, so planning ahead helps"
        return "fall is a great time to handle preventative upkeep"

    def _generate_caption_openai(
        self,
        *,
        business_name: str,
        category: str,
        service_name: str,
        location_text: str,
        seasonal_hint: str,
        angle: str,
        tone: str,
        cta: str,
        post_type: PostType,
        offer_context: dict | None,
        event_context: dict | None,
        media_tags: list[str],
    ) -> str | None:
        if not settings.OPENAI_API_KEY:
            return None
        system = (
            "You write Google Business Profile posts for local businesses. "
            "Keep copy factual, evergreen, and non-spammy. "
            "Never claim completed jobs, promotions, or events unless explicitly provided. "
            "Return plain text only."
        )
        user = {
            "post_type": post_type.value,
            "business_name": business_name,
            "business_category": category,
            "service": service_name,
            "location": location_text,
            "angle": angle,
            "tone": tone,
            "seasonal_hint": seasonal_hint,
            "cta": cta,
            "media_tags": media_tags,
            "verified_offer": offer_context,
            "verified_event": event_context,
            "constraints": [
                "80-220 words",
                "one clear CTA",
                "no fabricated specifics",
                "natural location mention",
            ],
        }
        payload = {
            "model": "gpt-4o-mini",
            "temperature": 0.6,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": str(user)},
            ],
        }
        headers = {
            "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
            "Content-Type": "application/json",
        }
        try:
            with httpx.Client(timeout=20.0) as client:
                response = client.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
            message = data["choices"][0]["message"]["content"]
            return str(message).strip() if message else None
        except Exception:  # noqa: BLE001
            return None

    def _fallback_caption(
        self,
        *,
        post_type: PostType,
        business_name: str,
        category: str,
        service_name: str,
        location_text: str,
        seasonal_hint: str,
        angle: str,
        tone: str,
        cta: str,
        offer_context: dict | None,
        event_context: dict | None,
    ) -> str:
        tone_openers = {
            "friendly": "Friendly guidance from your local team:",
            "professional": "Professional update:",
            "bold": "Ready for strong, dependable results?",
            "concise": "Quick update:",
        }
        opener = tone_openers.get(tone, "Quick update:")
        if post_type == PostType.OFFER and offer_context:
            title = offer_context.get("title") or offer_context.get("name") or "special offer"
            details = offer_context.get("description") or "Contact us for current terms."
            return (
                f"{opener} {business_name} is featuring a verified {title} for customers in {location_text}. "
                f"Our {category} team can help with {service_name}. {details} {cta}"
            )
        if post_type == PostType.EVENT and event_context:
            name = event_context.get("title") or event_context.get("name") or "upcoming event"
            details = event_context.get("description") or "Reach out for full details."
            return (
                f"{opener} {business_name} has a verified event update: {name}. "
                f"We support customers in {location_text} with {service_name}. {details} {cta}"
            )
        angle_map = {
            "service_highlight": (
                f"{business_name} provides {service_name} in {location_text}.",
                f"Our {category} team focuses on clear communication and dependable service.",
            ),
            "educational": (
                f"Small issues related to {service_name} can become bigger over time.",
                f"{business_name} helps property owners in {location_text} make informed decisions.",
            ),
            "seasonal_reminder": (
                f"As seasons change, {seasonal_hint}.",
                f"{business_name} supports {location_text} customers with {service_name}.",
            ),
            "maintenance_guidance": (
                f"Routine upkeep helps extend performance and reduce avoidable repairs.",
                f"Our {category} team offers {service_name} for homes and businesses in {location_text}.",
            ),
            "credibility": (
                f"When you need {service_name}, choosing an experienced local team matters.",
                f"{business_name} works with customers across {location_text} with a practical, professional approach.",
            ),
        }
        line_one, line_two = angle_map.get(angle, angle_map["service_highlight"])
        if tone == "concise":
            return f"{opener} {line_one} {cta}"
        return f"{opener} {line_one} {line_two} {cta}"

    def _recent_bodies(self, location_id: uuid.UUID, days: int = 60) -> list[str]:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        posts = (
            self.db.query(Post)
            .filter(Post.location_id == location_id)
            .filter(Post.created_at >= cutoff)
            .all()
        )
        return [post.body for post in posts if post.body]

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
        if not settings.OPENAI_API_KEY:
            return None
        payload = {"input": text, "model": "text-embedding-3-small"}
        headers = {"Authorization": f"Bearer {settings.OPENAI_API_KEY}"}
        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.post("https://api.openai.com/v1/embeddings", json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
            return data["data"][0]["embedding"]
        except Exception:  # noqa: BLE001
            return None

    def _embedding_sim(self, stored_embedding: list[float], caption: str, threshold: float = 0.90) -> bool:
        new_embedding = self._embedding(caption)
        if not new_embedding or not stored_embedding:
            return False
        dot = sum(a * b for a, b in zip(stored_embedding, new_embedding))
        norm_a = math.sqrt(sum(a * a for a in stored_embedding))
        norm_b = math.sqrt(sum(b * b for b in new_embedding))
        if not norm_a or not norm_b:
            return False
        sim = dot / (norm_a * norm_b)
        return sim >= threshold

    def _sync_gbp_media_best_effort(self, candidate: PostCandidate) -> None:
        location = candidate.location
        if not location or not location.google_location_id:
            return
        try:
            self.gbp_sync.sync_media(candidate.organization_id, candidate.location_id)
        except Exception:  # noqa: BLE001
            # Keep automation resilient when GBP sync is unavailable.
            return

    @staticmethod
    def _fingerprint(text: str) -> str:
        import hashlib

        normalized = " ".join(text.lower().split())
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:32]
