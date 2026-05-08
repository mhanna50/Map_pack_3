from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from hashlib import sha256
import math
from random import Random
from typing import Any, Protocol, Sequence
import uuid

from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.models.google_business.location import Location
from backend.app.models.posts.post import Post
from backend.app.models.rank_tracking.rank_snapshot import RankSnapshot


@dataclass(frozen=True)
class KeywordMarketMetric:
    search_volume: int
    competition: float  # 0.0 - 1.0
    avg_monthly_searches: int | None = None
    average_cpc_micros: int | None = None
    top_of_page_bid_low_micros: int | None = None
    top_of_page_bid_high_micros: int | None = None
    competition_index: float | None = None
    competition_level: str | None = None
    provider: str = "unknown"
    source_query: dict[str, Any] = field(default_factory=dict)
    raw_json: dict[str, Any] = field(default_factory=dict)


class KeywordDataProvider(Protocol):
    provider_name: str

    def fetch_market_metrics(
        self,
        *,
        location: Location,
        keywords: Sequence[str],
    ) -> dict[str, KeywordMarketMetric]:
        ...

    def fetch_service_keyword_ideas(
        self,
        *,
        location: Location,
        service_name: str,
        seed_keywords: Sequence[str],
        page_url: str | None = None,
        max_results: int = 80,
    ) -> dict[str, KeywordMarketMetric]:
        ...


class HeuristicKeywordDataProvider:
    """
    Offline/test fallback keyword source.

    Production keyword campaigns should use GoogleAdsKeywordDataProvider. This
    fallback keeps local tests and development deterministic when credentials
    are unavailable, and it marks every metric as heuristic so downstream audit
    output cannot confuse it with Keyword Planner data.
    """

    provider_name = "heuristic_offline"

    def fetch_market_metrics(
        self,
        *,
        location: Location,
        keywords: Sequence[str],
    ) -> dict[str, KeywordMarketMetric]:
        return self.fetch_service_keyword_ideas(
            location=location,
            service_name="",
            seed_keywords=keywords,
            max_results=len(keywords),
        )

    def fetch_service_keyword_ideas(
        self,
        *,
        location: Location,
        service_name: str,
        seed_keywords: Sequence[str],
        page_url: str | None = None,
        max_results: int = 80,
    ) -> dict[str, KeywordMarketMetric]:
        metrics: dict[str, KeywordMarketMetric] = {}
        seed_base = f"{location.organization_id}:{location.id}:{service_name}"
        for keyword in list(seed_keywords)[:max_results]:
            hashed = int(sha256(f"{seed_base}:{keyword}".encode("utf-8")).hexdigest()[:10], 16)
            # Produce stable but varied market estimates.
            volume = 30 + (hashed % 420)
            competition_index = float((hashed % 88) + 8)
            competition = competition_index / 100.0
            cpc_micros = int((150_000 + (hashed % 1_050_000)))
            bid_low = max(50_000, int(cpc_micros * 0.65))
            bid_high = int(cpc_micros * 1.8)
            metrics[keyword] = KeywordMarketMetric(
                search_volume=volume,
                avg_monthly_searches=volume,
                average_cpc_micros=cpc_micros,
                top_of_page_bid_low_micros=bid_low,
                top_of_page_bid_high_micros=bid_high,
                competition=max(0.05, min(competition, 0.99)),
                competition_index=competition_index,
                competition_level=self._competition_level(competition_index),
                provider=self.provider_name,
                source_query={
                    "service_name": service_name,
                    "seed_keywords": list(seed_keywords),
                    "page_url": page_url,
                },
                raw_json={"offline_hash": hashed},
            )
        return metrics

    @staticmethod
    def _competition_level(competition_index: float) -> str:
        if competition_index <= 33:
            return "low"
        if competition_index <= 66:
            return "medium"
        return "high"


class GoogleAdsKeywordDataProvider:
    """Google Ads KeywordPlanIdeaService adapter for Keyword Planner data."""

    provider_name = "google_ads_keyword_planner"

    def __init__(self, client: Any | None = None) -> None:
        self._client = client

    @classmethod
    def configured(cls) -> bool:
        return bool(
            settings.GOOGLE_ADS_DEVELOPER_TOKEN
            and settings.GOOGLE_ADS_CLIENT_ID
            and settings.GOOGLE_ADS_CLIENT_SECRET
            and settings.GOOGLE_ADS_REFRESH_TOKEN
            and settings.GOOGLE_ADS_CUSTOMER_ID
        )

    def fetch_market_metrics(
        self,
        *,
        location: Location,
        keywords: Sequence[str],
    ) -> dict[str, KeywordMarketMetric]:
        return self.fetch_service_keyword_ideas(
            location=location,
            service_name="",
            seed_keywords=keywords,
            max_results=max(1, len(keywords)),
        )

    def fetch_service_keyword_ideas(
        self,
        *,
        location: Location,
        service_name: str,
        seed_keywords: Sequence[str],
        page_url: str | None = None,
        max_results: int = 80,
    ) -> dict[str, KeywordMarketMetric]:
        client = self._client or self._build_client()
        keyword_plan_idea_service = client.get_service("KeywordPlanIdeaService")
        google_ads_service = client.get_service("GoogleAdsService")
        request = client.get_type("GenerateKeywordIdeasRequest")
        request.customer_id = settings.GOOGLE_ADS_CUSTOMER_ID.replace("-", "")
        request.language = google_ads_service.language_constant_path(settings.GOOGLE_ADS_LANGUAGE_ID)
        request.include_adult_keywords = False
        request.keyword_plan_network = client.enums.KeywordPlanNetworkEnum.GOOGLE_SEARCH_AND_PARTNERS

        geo_target_ids = self._geo_target_ids(location)
        geo_target_service = client.get_service("GeoTargetConstantService")
        request.geo_target_constants.extend(
            [geo_target_service.geo_target_constant_path(geo_id) for geo_id in geo_target_ids]
        )

        seeds = [item for item in dict.fromkeys([service_name, *seed_keywords]) if item]
        if not seeds and not page_url:
            raise ValueError("Google Ads keyword ideas require at least one service keyword or URL seed")
        if seeds and page_url:
            request.keyword_and_url_seed.url = page_url
            request.keyword_and_url_seed.keywords.extend(seeds)
        elif seeds:
            request.keyword_seed.keywords.extend(seeds)
        else:
            request.url_seed.url = page_url

        response = keyword_plan_idea_service.generate_keyword_ideas(request=request)
        metrics: dict[str, KeywordMarketMetric] = {}
        for index, idea in enumerate(response):
            if index >= max_results:
                break
            keyword = str(getattr(idea, "text", "") or "").strip()
            if not keyword:
                continue
            metric = self._metric_from_google_ads_result(
                idea,
                source_query={
                    "service_name": service_name,
                    "seed_keywords": seeds,
                    "page_url": page_url,
                    "geo_target_ids": geo_target_ids,
                    "language_id": settings.GOOGLE_ADS_LANGUAGE_ID,
                    "customer_id": request.customer_id,
                },
            )
            metrics[keyword] = metric
        return metrics

    def _build_client(self) -> Any:
        if not self.configured():
            raise ValueError("Google Ads Keyword Planner credentials are not configured")
        try:
            from google.ads.googleads.client import GoogleAdsClient
        except ImportError as exc:  # pragma: no cover - depends on optional package install
            raise RuntimeError("google-ads package is not installed") from exc

        config: dict[str, Any] = {
            "developer_token": settings.GOOGLE_ADS_DEVELOPER_TOKEN,
            "client_id": settings.GOOGLE_ADS_CLIENT_ID,
            "client_secret": settings.GOOGLE_ADS_CLIENT_SECRET,
            "refresh_token": settings.GOOGLE_ADS_REFRESH_TOKEN,
            "use_proto_plus": True,
        }
        if settings.GOOGLE_ADS_LOGIN_CUSTOMER_ID:
            config["login_customer_id"] = settings.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace("-", "")
        return GoogleAdsClient.load_from_dict(config, version=settings.GOOGLE_ADS_API_VERSION)

    @staticmethod
    def _metric_from_google_ads_result(idea: Any, *, source_query: dict[str, Any]) -> KeywordMarketMetric:
        metrics = getattr(idea, "keyword_idea_metrics", None)
        avg_monthly = int(getattr(metrics, "avg_monthly_searches", 0) or 0) if metrics else 0
        competition_level = GoogleAdsKeywordDataProvider._enum_name(getattr(metrics, "competition", None))
        competition_index_raw = getattr(metrics, "competition_index", None) if metrics else None
        competition_index = float(competition_index_raw) if competition_index_raw is not None else None
        competition = (
            max(0.01, min(1.0, competition_index / 100.0))
            if competition_index is not None
            else GoogleAdsKeywordDataProvider._competition_from_level(competition_level)
        )
        average_cpc_micros = GoogleAdsKeywordDataProvider._optional_int(metrics, "average_cpc_micros")
        low_bid = GoogleAdsKeywordDataProvider._optional_int(metrics, "low_top_of_page_bid_micros")
        high_bid = GoogleAdsKeywordDataProvider._optional_int(metrics, "high_top_of_page_bid_micros")
        return KeywordMarketMetric(
            search_volume=avg_monthly,
            avg_monthly_searches=avg_monthly,
            average_cpc_micros=average_cpc_micros,
            top_of_page_bid_low_micros=low_bid,
            top_of_page_bid_high_micros=high_bid,
            competition=competition,
            competition_index=competition_index,
            competition_level=competition_level.lower() if competition_level else None,
            provider=GoogleAdsKeywordDataProvider.provider_name,
            source_query=source_query,
            raw_json={
                "text": str(getattr(idea, "text", "") or ""),
                "avg_monthly_searches": avg_monthly,
                "competition": competition_level,
                "competition_index": competition_index,
                "average_cpc_micros": average_cpc_micros,
                "low_top_of_page_bid_micros": low_bid,
                "high_top_of_page_bid_micros": high_bid,
            },
        )

    @staticmethod
    def _optional_int(metrics: Any, field_name: str) -> int | None:
        if metrics is None:
            return None
        value = getattr(metrics, field_name, None)
        if value in (None, 0):
            return None
        return int(value)

    @staticmethod
    def _enum_name(value: Any) -> str | None:
        if value is None:
            return None
        name = getattr(value, "name", None)
        if isinstance(name, str) and name:
            return name
        text = str(value)
        return text.rsplit(".", 1)[-1] if text else None

    @staticmethod
    def _competition_from_level(level: str | None) -> float:
        normalized = (level or "").lower()
        if normalized == "low":
            return 0.25
        if normalized == "medium":
            return 0.55
        if normalized == "high":
            return 0.85
        return 0.5

    @staticmethod
    def _geo_target_ids(location: Location) -> list[str]:
        settings_json = dict(location.settings.settings_json or {}) if location.settings else {}
        values = settings_json.get("google_ads_geo_target_ids") or settings_json.get("geo_target_ids")
        if not values:
            values = (location.external_ids or {}).get("google_ads_geo_target_ids")
        if not values:
            values = settings.GOOGLE_ADS_GEO_TARGET_IDS
        if isinstance(values, str):
            result = [item.strip() for item in values.split(",") if item.strip()]
        elif isinstance(values, list):
            result = [str(item).strip() for item in values if str(item).strip()]
        else:
            result = []
        if settings.REQUIRE_GOOGLE_KEYWORD_PLANNER and not result:
            raise ValueError("Google Ads geo target IDs are required for location-aware keyword planning")
        return result


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
