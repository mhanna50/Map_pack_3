from __future__ import annotations

from difflib import SequenceMatcher
import re

from backend.app.models.enums import PostType


class ContentGuardrails:
    JOB_COMPLETION_PATTERNS = [
        r"\bjust\s+(finished|completed)\b",
        r"\brecently\s+(finished|completed)\b",
        r"\bcompleted\s+(a|an|the)\s+(job|project)\b",
        r"\byesterday\b",
        r"\blast\s+night\b",
    ]
    OFFER_PATTERNS = [
        r"\blimited[-\s]?time\b",
        r"\bdiscount\b",
        r"\b\d{1,2}%\s*off\b",
        r"\bsale\b",
        r"\bcoupon\b",
        r"\bpromo\b",
    ]
    EVENT_PATTERNS = [
        r"\bjoin us\b",
        r"\bevent\b",
        r"\bregister\b",
        r"\bthis (weekend|saturday|sunday)\b",
    ]
    CTA_PATTERN = re.compile(
        r"\b(call|contact|schedule|book|message|visit|learn more|get started|reach out)\b", re.IGNORECASE
    )

    def validate(
        self,
        text: str,
        *,
        post_type: PostType,
        service: str | None,
        location: str | None,
        has_verified_offer: bool,
        has_verified_event: bool,
        recent_texts: list[str] | None = None,
        require_cta: bool = True,
    ) -> list[str]:
        errors: list[str] = []
        lowered = text.lower()

        if any(re.search(pattern, lowered) for pattern in self.JOB_COMPLETION_PATTERNS):
            errors.append("contains_unverifiable_job_completion_claim")

        if post_type != PostType.OFFER and not has_verified_offer:
            if any(re.search(pattern, lowered) for pattern in self.OFFER_PATTERNS):
                errors.append("contains_unverified_offer_language")

        if post_type != PostType.EVENT and not has_verified_event:
            if any(re.search(pattern, lowered) for pattern in self.EVENT_PATTERNS):
                errors.append("contains_unverified_event_language")

        if require_cta and not self.CTA_PATTERN.search(text):
            errors.append("missing_cta")

        if self._is_keyword_stuffing(text, service=service, location=location):
            errors.append("keyword_stuffing")

        if recent_texts:
            for prior in recent_texts:
                score = SequenceMatcher(None, lowered, prior.lower()).ratio()
                if score >= 0.9:
                    errors.append("too_repetitive")
                    break

        if len(text) > 1500:
            errors.append("exceeds_gbp_length")
        return errors

    @staticmethod
    def _is_keyword_stuffing(text: str, *, service: str | None, location: str | None) -> bool:
        lowered = text.lower()
        tokens = set()
        for value in (service, location):
            if not value:
                continue
            for token in re.findall(r"[a-z0-9]+", value.lower()):
                if len(token) >= 4:
                    tokens.add(token)
        if not tokens:
            return False
        repeats = 0
        for token in tokens:
            count = lowered.count(token)
            if count > 3:
                return True
            repeats += count
        return repeats > 8
