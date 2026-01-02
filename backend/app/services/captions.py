from __future__ import annotations

import random
from typing import Any

from backend.app.models.enums import PostType


class CaptionGenerator:
    """
    Placeholder AI-assisted caption generator.
    In production this would call OpenAI or another provider.
    """

    def __init__(self, brand_voice: dict | None = None) -> None:
        self.brand_voice = brand_voice or {}

    def generate_variants(
        self,
        *,
        base_prompt: str,
        services: list[str],
        keywords: list[str],
        locations: list[str],
        count: int = 3,
        post_type: PostType = PostType.UPDATE,
    ) -> list[dict[str, Any]]:
        variants: list[dict[str, Any]] = []
        tone = self.brand_voice.get("tone", "professional")
        voice = self.brand_voice.get("voice", "friendly and clear")
        for _ in range(count):
            service = random.choice(services) if services else "your services"
            keyword = random.choice(keywords) if keywords else ""
            city = random.choice(locations) if locations else ""
            body = (
                f"{base_prompt} {service} in {city}. "
                f"Our team delivers {keyword or 'outstanding results'} with a "
                f"{tone} voice ({voice})."
            ).strip()
            compliance = self._run_compliance_checks(body, post_type=post_type)
            variants.append({"body": body, "compliance_flags": compliance})
        return variants

    @staticmethod
    def _run_compliance_checks(body: str, *, post_type: PostType) -> dict[str, Any]:
        checks = {
            "length_ok": len(body) <= 1500,
            "has_phone": any(token.isdigit() and len(token) >= 7 for token in body.split()),
            "post_type": post_type.value,
        }
        return checks
