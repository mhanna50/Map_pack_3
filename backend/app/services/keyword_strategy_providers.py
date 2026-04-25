from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from hashlib import sha256
import math
from random import Random
from typing import Protocol, Sequence
import uuid

from sqlalchemy.orm import Session

from backend.app.models.location import Location
from backend.app.models.post import Post
from backend.app.models.rank_snapshot import RankSnapshot


@dataclass(frozen=True)
class KeywordMarketMetric:
    search_volume: int
    competition: float  # 0.0 - 1.0


class KeywordDataProvider(Protocol):
    def fetch_market_metrics(
        self,
        *,
        location: Location,
        keywords: Sequence[str],
    ) -> dict[str, KeywordMarketMetric]:
        ...


class HeuristicKeywordDataProvider:
    """
    Default placeholder keyword source.
    TODO: replace with a real provider adapter (Google Ads / Ahrefs / Semrush).
    """

    def fetch_market_metrics(
        self,
        *,
        location: Location,
        keywords: Sequence[str],
    ) -> dict[str, KeywordMarketMetric]:
        metrics: dict[str, KeywordMarketMetric] = {}
        seed_base = f"{location.organization_id}:{location.id}"
        for keyword in keywords:
            hashed = int(sha256(f"{seed_base}:{keyword}".encode("utf-8")).hexdigest()[:10], 16)
            # Produce stable but varied market estimates.
            volume = 30 + (hashed % 420)
            competition = ((hashed % 88) + 8) / 100.0
            metrics[keyword] = KeywordMarketMetric(
                search_volume=volume,
                competition=max(0.05, min(competition, 0.99)),
            )
        return metrics


class GbpInsightsProvider(Protocol):
    def get_search_terms(
        self,
        *,
        organization_id: uuid.UUID,
        location: Location,
        limit: int = 50,
    ) -> list[dict]:
        ...


class LocalGbpInsightsProvider:
    """
    Reads local app data as a lightweight GBP insights proxy.
    TODO: connect a real GBP performance/search terms endpoint.
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_search_terms(
        self,
        *,
        organization_id: uuid.UUID,
        location: Location,
        limit: int = 50,
    ) -> list[dict]:
        terms: list[dict] = []
        from_settings = []
        if location.settings and location.settings.keywords:
            from_settings = [str(item).strip() for item in location.settings.keywords if str(item).strip()]
        for idx, term in enumerate(from_settings[:limit]):
            terms.append({"term": term, "impressions": max(20, 120 - idx * 7), "source": "location_settings"})

        # Fall back to recently used post topic tags.
        if len(terms) < limit:
            posts = (
                self.db.query(Post)
                .filter(Post.organization_id == organization_id, Post.location_id == location.id)
                .order_by(Post.created_at.desc())
                .limit(50)
                .all()
            )
            for post in posts:
                for tag in post.topic_tags or []:
                    cleaned = str(tag).strip()
                    if not cleaned:
                        continue
                    terms.append(
                        {
                            "term": cleaned,
                            "impressions": 20,
                            "source": "post_topic_tag",
                        }
                    )
                    if len(terms) >= limit:
                        break
                if len(terms) >= limit:
                    break

        deduped: list[dict] = []
        seen: set[str] = set()
        for item in terms:
            term = str(item.get("term") or "").strip().lower()
            if not term or term in seen:
                continue
            seen.add(term)
            deduped.append(item)
            if len(deduped) >= limit:
                break
        return deduped


@dataclass(frozen=True)
class GeoGridScanPointResult:
    row_index: int
    column_index: int
    latitude: float
    longitude: float
    rank: int | None
    competitor_name: str | None


@dataclass(frozen=True)
class GeoGridScanResult:
    center_latitude: float
    center_longitude: float
    radius_miles: float
    spacing_miles: float
    rows: int
    columns: int
    points: list[GeoGridScanPointResult]


class GeoGridProvider(Protocol):
    def run_scan(
        self,
        *,
        location: Location,
        keyword: str,
        scan_type: str,
        grid_config: dict,
        as_of: date,
    ) -> GeoGridScanResult:
        ...


class MockGeoGridProvider:
    """
    Deterministic fallback geo-grid provider.
    TODO: replace with a real geo-grid/rank tracking provider integration.
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    def run_scan(
        self,
        *,
        location: Location,
        keyword: str,
        scan_type: str,
        grid_config: dict,
        as_of: date,
    ) -> GeoGridScanResult:
        rows = int(grid_config.get("rows") or 7)
        columns = int(grid_config.get("columns") or 7)
        radius_miles = float(grid_config.get("radius_miles") or 5.0)
        spacing_miles = float(grid_config.get("spacing_miles") or 1.0)
        center_lat = float(location.latitude or grid_config.get("center_latitude") or 37.7749)
        center_lng = float(location.longitude or grid_config.get("center_longitude") or -122.4194)

        distance_step_deg = spacing_miles / 69.0
        center_row = rows // 2
        center_col = columns // 2
        seed = int(sha256(f"{location.id}:{keyword}:{as_of.isoformat()}".encode("utf-8")).hexdigest()[:10], 16)
        rng = Random(seed)
        baseline_bias = self._historical_bias(location=location, keyword=keyword)
        followup_bonus = 1.8 if scan_type == "followup" else 0.0

        points: list[GeoGridScanPointResult] = []
        for row in range(rows):
            for col in range(columns):
                lat = center_lat + (row - center_row) * distance_step_deg
                lng = center_lng + (col - center_col) * distance_step_deg
                distance_factor = math.sqrt((row - center_row) ** 2 + (col - center_col) ** 2)
                noise = rng.uniform(-1.8, 1.8)
                raw_rank = 5.5 + baseline_bias + distance_factor * 1.3 + noise - followup_bonus
                if raw_rank > 18 and rng.random() > 0.55:
                    rank = None
                else:
                    rank = max(1, min(20, int(round(raw_rank))))
                points.append(
                    GeoGridScanPointResult(
                        row_index=row,
                        column_index=col,
                        latitude=lat,
                        longitude=lng,
                        rank=rank,
                        competitor_name="Competitor Co" if rank and rank > 3 else None,
                    )
                )

        return GeoGridScanResult(
            center_latitude=center_lat,
            center_longitude=center_lng,
            radius_miles=radius_miles,
            spacing_miles=spacing_miles,
            rows=rows,
            columns=columns,
            points=points,
        )

    def _historical_bias(self, *, location: Location, keyword: str) -> float:
        if not location.settings:
            return 2.0
        keywords = location.settings.keywords or []
        lowered = {str(item).strip().lower() for item in keywords}
        if keyword.lower() in lowered:
            return -0.8
        return 1.7


class RankInsightsProvider:
    """Pulls a lightweight current-rank estimate per location keyword from historical snapshots."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def latest_rank_map(self, *, location_id: uuid.UUID) -> dict[str, float]:
        rows = (
            self.db.query(RankSnapshot)
            .filter(RankSnapshot.location_id == location_id)
            .order_by(RankSnapshot.checked_at.desc())
            .limit(300)
            .all()
        )
        result: dict[str, list[int]] = {}
        for row in rows:
            if not row.keyword or not row.keyword.keyword:
                continue
            if row.rank is None:
                continue
            key = row.keyword.keyword.strip().lower()
            result.setdefault(key, []).append(row.rank)
        aggregated: dict[str, float] = {}
        for key, ranks in result.items():
            if not ranks:
                continue
            aggregated[key] = sum(ranks[:5]) / min(5, len(ranks))
        return aggregated
