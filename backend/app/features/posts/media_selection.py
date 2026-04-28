from __future__ import annotations

from datetime import datetime, timedelta, timezone
import re

from sqlalchemy.orm import Session

from backend.app.models.media.media_asset import MediaAsset

GENERAL_PHOTO_TAGS = {
    "team",
    "crew",
    "staff",
    "office",
    "business",
    "branding",
    "equipment",
    "truck",
    "service",
    "general",
}


class MediaSelector:
    def __init__(self, db: Session, freshness_days: int = 14) -> None:
        self.db = db
        self.reuse_window = timedelta(days=freshness_days)

    def pick_asset(
        self,
        *,
        location_id,
        theme: str | None = None,
        service: str | None = None,
        prefer_upload: bool = True,
        min_reuse_gap_days: int | None = None,
        mark_used: bool = True,
    ) -> MediaAsset | None:
        query = self.db.query(MediaAsset).filter(MediaAsset.location_id == location_id)
        assets = query.all()
        if not assets:
            return None
        reuse_window = timedelta(days=min_reuse_gap_days) if min_reuse_gap_days is not None else self.reuse_window
        cutoff = datetime.now(timezone.utc) - reuse_window

        service_tokens = self._tokenize(service)
        theme_tokens = self._tokenize(theme)
        relevance = {
            asset.id: self._relevance_score(asset, service_tokens=service_tokens, theme_tokens=theme_tokens)
            for asset in assets
        }
        uploads = [asset for asset in assets if (asset.source or "upload") == "upload"]
        gbp = [asset for asset in assets if (asset.source or "upload") == "gbp"]
        other = [asset for asset in assets if (asset.source or "upload") not in {"upload", "gbp"}]
        gbp = gbp + other

        ordered_pools = [uploads, gbp] if prefer_upload else [gbp, uploads]
        pools: list[list[MediaAsset]] = []
        for pool in ordered_pools:
            pools.append([asset for asset in pool if relevance.get(asset.id, 0) > 0])
        for pool in ordered_pools:
            pools.append(list(pool))

        chosen: MediaAsset | None = None
        for pool in pools:
            if not pool:
                continue
            eligible = [asset for asset in pool if not asset.last_used_at or asset.last_used_at <= cutoff]
            ranked_pool = eligible if eligible else pool
            chosen = sorted(
                ranked_pool,
                key=self._sort_key,
            )[0]
            if chosen:
                break

        if chosen and mark_used:
            self.mark_used(chosen)
        return chosen

    def mark_used(self, asset: MediaAsset, *, used_at: datetime | None = None) -> MediaAsset:
        asset.last_used_at = used_at or datetime.now(timezone.utc)
        asset.usage_count = int(asset.usage_count or 0) + 1
        self.db.add(asset)
        self.db.commit()
        self.db.refresh(asset)
        return asset

    def _sort_key(self, asset: MediaAsset) -> tuple:
        never_used = 0 if asset.last_used_at is None else 1
        created_at = self._as_aware(asset.created_at)
        last_used = self._as_aware(asset.last_used_at) if asset.last_used_at else datetime.min.replace(tzinfo=timezone.utc)
        # Prioritize never-used assets, then oldest last usage, then lowest usage count.
        return (
            never_used,
            last_used,
            int(asset.usage_count or 0),
            -created_at.timestamp(),
        )

    def _relevance_score(
        self,
        asset: MediaAsset,
        *,
        service_tokens: set[str],
        theme_tokens: set[str],
    ) -> int:
        tags = self._asset_tags(asset)
        score = 0
        if service_tokens and service_tokens.intersection(tags):
            score += 3
        if theme_tokens and theme_tokens.intersection(tags):
            score += 2
        if not service_tokens and not theme_tokens:
            score += 1
        if tags.intersection(GENERAL_PHOTO_TAGS):
            score += 1
        return score

    def _asset_tags(self, asset: MediaAsset) -> set[str]:
        tags: set[str] = set()
        for value in asset.categories or []:
            tags.update(self._tokenize(str(value)))
        for value in (asset.job_type, asset.season, asset.shot_stage, asset.description, asset.file_name):
            tags.update(self._tokenize(value))
        metadata = asset.metadata_json or {}
        raw_tags = metadata.get("tags") or metadata.get("service_tags") or []
        if isinstance(raw_tags, list):
            for value in raw_tags:
                tags.update(self._tokenize(str(value)))
        return tags

    @staticmethod
    def _tokenize(value: str | None) -> set[str]:
        if not value:
            return set()
        return {token for token in re.findall(r"[a-z0-9]+", value.lower()) if len(token) >= 3}

    @staticmethod
    def _as_aware(value: datetime | None) -> datetime:
        if value is None:
            return datetime.min.replace(tzinfo=timezone.utc)
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
