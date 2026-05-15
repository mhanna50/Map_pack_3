from __future__ import annotations

import calendar
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from hashlib import sha256
import math
import re
from typing import Any, Iterable
import uuid

from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.models.automation.action import Action
from backend.app.models.rank_tracking.campaign_job_run import CampaignJobRun
from backend.app.models.enums import ActionType, LocationStatus
from backend.app.models.rank_tracking.gbp_post_keyword_mapping import GbpPostKeywordMapping
from backend.app.models.rank_tracking.gbp_optimization_action import GbpOptimizationAction
from backend.app.models.rank_tracking.geo_grid_scan import GeoGridScan
from backend.app.models.rank_tracking.geo_grid_scan_point import GeoGridScanPoint
from backend.app.models.rank_tracking.keyword_candidate import KeywordCandidate
from backend.app.models.rank_tracking.keyword_campaign_cycle import KeywordCampaignCycle
from backend.app.models.rank_tracking.keyword_dashboard_aggregate import KeywordDashboardAggregate
from backend.app.models.rank_tracking.keyword_score import KeywordScore
from backend.app.models.google_business.business_service import BusinessService
from backend.app.models.google_business.location import Location
from backend.app.models.google_business.location_settings import LocationSettings
from backend.app.models.identity.organization import Organization
from backend.app.models.media.media_asset import MediaAsset
from backend.app.models.rank_tracking.selected_keyword import SelectedKeyword
from backend.app.services.shared.settings import SettingsService
from backend.app.services.shared.validators import assert_location_in_org
from backend.app.services.rank_tracking.keyword_strategy_providers import (
    GeoGridProvider,
    GoogleAdsKeywordDataProvider,
    HeuristicKeywordDataProvider,
    KeywordDataProvider,
    KeywordMarketMetric,
    LocalGbpInsightsProvider,
    MockGeoGridProvider,
    RankInsightsProvider,
)

STOP_WORDS = {
    "and",
    "in",
    "the",
    "for",
    "of",
    "near",
    "me",
    "services",
    "service",
    "company",
}

INTENT_TOKENS = {
    "emergency": 32,
    "repair": 22,
    "replacement": 30,
    "installation": 25,
    "install": 25,
    "same day": 28,
    "24/7": 30,
    "urgent": 24,
    "consultation": 20,
    "quote": 18,
}

HIGH_TICKET_TOKENS = {
    "replacement": 28,
    "installation": 22,
    "install": 22,
    "surgery": 30,
    "implant": 24,
    "veneers": 24,
    "lawsuit": 30,
    "injury": 24,
    "roof replacement": 30,
    "ac replacement": 28,
    "furnace replacement": 28,
    "water heater replacement": 26,
}

DEFAULT_SCORE_WEIGHTS = {
    "value": 0.26,
    "relevance": 0.30,
    "intent": 0.14,
    "ticket_value": 0.08,
    "search_volume": 0.10,
    "opportunity": 0.08,
    "current_rank": 0.04,
    "competition_penalty": 0.10,
    "already_dominant_penalty": 1.00,
}

POST_ANGLE_ROTATION = [
    ("service_post", "update"),
    ("educational_post", "update"),
    ("seasonal_post", "update"),
    ("trust_post", "update"),
    ("before_after_post", "update"),
    ("offer_post", "offer"),
]

CTA_ROTATION = [
    "Call now to schedule service.",
    "Request a fast quote today.",
    "Message us to book your appointment.",
    "Contact us for same-day availability.",
]

IMAGE_THEME_ROTATION = [
    "team-at-work",
    "before-and-after",
    "customer-success",
    "local-landmark",
    "seasonal-service-scene",
]

DEFAULT_SERVICE_VALUE_CENTS = 35_000
FOLLOWUP_SCAN_DELAY_DAYS = 21
PROFILE_DESCRIPTION_ACTION_TYPE = "description_refresh"
SERVICE_DESCRIPTION_ACTION_TYPE = "service_description_update"


@dataclass(frozen=True)
class DiscoveryContext:
    primary_category: str | None
    secondary_categories: list[str]
    services: list[str]
    city: str | None
    state: str | None
    service_area_cities: list[str]
    existing_description: str | None
    website_url: str | None
    historical_keywords: list[str]
    gbp_search_terms: list[str]
    current_rank_map: dict[str, float]
    scoring_weights: dict[str, float]


@dataclass(frozen=True)
class ScoredCandidate:
    business_service_id: uuid.UUID | None
    service_name: str | None
    keyword: str
    normalized_keyword: str
    cluster_key: str
    target_service_area: str | None
    candidate_type: str | None
    source_tags: list[str]
    relevance_score: float
    local_volume_score: float
    intent_score: float
    ticket_value_score: float
    value_score: float
    competition_score: float
    opportunity_score: float
    current_rank_score: float
    already_dominant_penalty: float
    overall_score: float
    search_volume: int
    average_cpc_micros: int | None
    top_of_page_bid_low_micros: int | None
    top_of_page_bid_high_micros: int | None
    competition_estimate: float
    competition_index: float | None
    competition_level: str | None
    current_rank: float | None
    service_value_cents: int | None
    provider: str | None
    source_query: dict[str, Any]
    classifications: list[str]
    why_selected: str
    retained_from_selected_keyword_id: uuid.UUID | None = None


class KeywordCampaignService:
    def __init__(
        self,
        db: Session,
        *,
        keyword_data_provider: KeywordDataProvider | None = None,
        geo_grid_provider: GeoGridProvider | None = None,
    ) -> None:
        self.db = db
        self.settings = SettingsService(db)
        from backend.app.services.automation.actions import ActionService

        self.action_service = ActionService(db)
        self.keyword_data_provider = keyword_data_provider or self._default_keyword_data_provider()
        self.geo_grid_provider = geo_grid_provider or MockGeoGridProvider(db)
        self.gbp_insights = LocalGbpInsightsProvider(db)
        self.rank_insights = RankInsightsProvider(db)

    @staticmethod
    def _default_keyword_data_provider() -> KeywordDataProvider:
        if GoogleAdsKeywordDataProvider.configured():
            return GoogleAdsKeywordDataProvider()
        if settings.REQUIRE_GOOGLE_KEYWORD_PLANNER:
            missing = ", ".join(GoogleAdsKeywordDataProvider.missing_required_settings())
            raise ValueError(
                "Google Ads Keyword Planner is required but credentials are not configured"
                + (f": {missing}" if missing else "")
            )
        return HeuristicKeywordDataProvider()

    def run_cycle(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        cycle_year: int | None = None,
        cycle_month: int | None = None,
        trigger_source: str = "monthly",
        onboarding_triggered: bool = False,
    ) -> KeywordCampaignCycle:
        location = assert_location_in_org(self.db, location_id=location_id, organization_id=organization_id)
        from backend.app.services.google_business.readiness import GbpReadinessService

        GbpReadinessService(self.db).ensure_ready_for_automation(
            organization_id=organization_id,
            location_id=location_id,
        )
        today = datetime.now(timezone.utc).date()
        year = cycle_year or today.year
        month = cycle_month or today.month
        dedupe_key = f"keyword-cycle:{organization_id}:{location_id}:{year:04d}-{month:02d}"
        job = self._start_job_run(
            organization_id=organization_id,
            location_id=location_id,
            dedupe_key=dedupe_key,
            job_type="keyword_campaign_cycle",
            triggered_by=trigger_source,
        )
        if not job:
            existing = self._existing_cycle(
                organization_id=organization_id,
                location_id=location_id,
                cycle_year=year,
                cycle_month=month,
            )
            if existing:
                return existing
            raise ValueError("A keyword campaign run is already in progress for this location and month")

        cycle = self._get_or_create_cycle(
            organization_id=organization_id,
            location_id=location_id,
            cycle_year=year,
            cycle_month=month,
            trigger_source=trigger_source,
            onboarding_triggered=onboarding_triggered,
        )
        try:
            cycle.status = "running"
            cycle.started_at = datetime.now(timezone.utc)
            self.db.add(cycle)
            self.db.commit()

            self._clear_cycle_children(cycle.id)

            business_services = self._sync_business_services(location)
            context = self._build_discovery_context(organization_id=organization_id, location=location)
            scored = self._score_candidates(
                location=location,
                context=context,
                business_services=business_services,
            )
            previous_active = self._previous_active_keywords(location_id=location.id)
            selected, retained_previous_ids, replaced_previous_ids = self._select_candidates_by_service(
                scored=scored,
                business_services=business_services,
                previous_active=previous_active,
            )
            if not selected:
                raise ValueError("Keyword selection failed to produce service-mapped keywords")

            selected_rows = self._persist_keyword_candidates_and_scores(
                cycle=cycle,
                location=location,
                scored_candidates=scored,
                selected=selected,
                score_weights=context.scoring_weights,
            )
            self._deactivate_previous_keywords(
                previous_active=previous_active,
                retained_previous_ids=retained_previous_ids,
                replaced_previous_ids=replaced_previous_ids,
            )
            self._sync_location_keyword_targets(location=location, selected_keywords=selected_rows)
            self._create_gbp_optimization_actions(
                cycle=cycle,
                location=location,
                selected_keywords=selected_rows,
                context=context,
            )
            self._create_monthly_post_plan(
                cycle=cycle,
                location=location,
                selected_keywords=selected_rows,
            )
            self._run_geo_grid_scans_for_cycle(cycle=cycle, selected_keywords=selected_rows, scan_type="baseline")
            cycle.baseline_scanned_at = datetime.now(timezone.utc)
            cycle.followup_due_at = datetime.now(timezone.utc) + timedelta(days=FOLLOWUP_SCAN_DELAY_DAYS)
            cycle.status = "completed"
            cycle.completed_at = datetime.now(timezone.utc)
            cycle.data_sources_json = {
                "keyword_provider": getattr(
                    self.keyword_data_provider,
                    "provider_name",
                    self.keyword_data_provider.__class__.__name__,
                ),
                "keyword_provider_class": self.keyword_data_provider.__class__.__name__,
                "requires_google_keyword_planner": settings.REQUIRE_GOOGLE_KEYWORD_PLANNER,
                "gbp_insights_provider": self.gbp_insights.__class__.__name__,
                "geo_grid_provider": self.geo_grid_provider.__class__.__name__,
            }
            self.db.add(cycle)
            self.db.commit()
            self._schedule_followup_scan(cycle)
            self._rebuild_dashboard_aggregate(cycle)
            self._finish_job_run(job, status="completed", details={"cycle_id": str(cycle.id)})
            self.db.refresh(cycle)
            return cycle
        except Exception as exc:  # noqa: BLE001
            self.db.rollback()
            cycle = self.db.get(KeywordCampaignCycle, cycle.id)
            if cycle:
                cycle.status = "failed"
                cycle.notes_json = {"error": str(exc)}
                self.db.add(cycle)
                self.db.commit()
            self._finish_job_run(job, status="failed", error=str(exc))
            raise

    def run_followup_scan(self, *, cycle_id: uuid.UUID) -> KeywordCampaignCycle:
        cycle = self.db.get(KeywordCampaignCycle, cycle_id)
        if not cycle:
            raise ValueError("Campaign cycle not found")
        dedupe_key = f"keyword-followup:{cycle.organization_id}:{cycle.location_id}:{cycle.cycle_year:04d}-{cycle.cycle_month:02d}"
        job = self._start_job_run(
            organization_id=cycle.organization_id,
            location_id=cycle.location_id,
            dedupe_key=dedupe_key,
            job_type="keyword_campaign_followup_scan",
            triggered_by="system_followup",
        )
        if not job:
            return cycle
        try:
            selected = (
                self.db.query(SelectedKeyword)
                .filter(SelectedKeyword.campaign_cycle_id == cycle.id)
                .order_by(SelectedKeyword.rank_order.asc())
                .all()
            )
            if not selected:
                raise ValueError("Cannot run followup scan without selected keywords")
            self._run_geo_grid_scans_for_cycle(cycle=cycle, selected_keywords=selected, scan_type="followup")
            cycle.followup_scanned_at = datetime.now(timezone.utc)
            if cycle.completed_at is None:
                cycle.completed_at = datetime.now(timezone.utc)
            if cycle.status != "failed":
                cycle.status = "completed"
            self.db.add(cycle)
            self.db.commit()
            self._rebuild_dashboard_aggregate(cycle)
            self._finish_job_run(job, status="completed", details={"cycle_id": str(cycle.id)})
            self.db.refresh(cycle)
            return cycle
        except Exception as exc:  # noqa: BLE001
            self.db.rollback()
            self._finish_job_run(job, status="failed", error=str(exc))
            raise

    def list_cycles(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        limit: int = 12,
    ) -> list[KeywordCampaignCycle]:
        return (
            self.db.query(KeywordCampaignCycle)
            .filter(
                KeywordCampaignCycle.organization_id == organization_id,
                KeywordCampaignCycle.location_id == location_id,
            )
            .order_by(KeywordCampaignCycle.cycle_year.desc(), KeywordCampaignCycle.cycle_month.desc())
            .limit(limit)
            .all()
        )

    def build_dashboard_payload(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        cycle_id: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        if cycle_id:
            cycle = self.db.get(KeywordCampaignCycle, cycle_id)
            if not cycle:
                raise ValueError("Campaign cycle not found")
            if cycle.organization_id != organization_id or cycle.location_id != location_id:
                raise ValueError("Campaign cycle does not belong to this organization/location")
        else:
            cycle = (
                self.db.query(KeywordCampaignCycle)
                .filter(
                    KeywordCampaignCycle.organization_id == organization_id,
                    KeywordCampaignCycle.location_id == location_id,
                )
                .order_by(KeywordCampaignCycle.cycle_year.desc(), KeywordCampaignCycle.cycle_month.desc())
                .first()
            )
        if not cycle:
            return {
                "has_data": False,
                "cycle": None,
                "overview": {},
                "keywords": [],
                "opportunities": {},
                "gbp_actions": [],
                "post_plan": [],
                "geo_grid": {},
                "history": [],
                "audit": {},
            }

        aggregate = (
            self.db.query(KeywordDashboardAggregate)
            .filter(KeywordDashboardAggregate.campaign_cycle_id == cycle.id)
            .one_or_none()
        )
        selected_keywords = (
            self.db.query(SelectedKeyword)
            .filter(SelectedKeyword.campaign_cycle_id == cycle.id)
            .order_by(SelectedKeyword.rank_order.asc())
            .all()
        )
        actions = (
            self.db.query(GbpOptimizationAction)
            .filter(GbpOptimizationAction.campaign_cycle_id == cycle.id)
            .order_by(GbpOptimizationAction.created_at.asc())
            .all()
        )
        mappings = (
            self.db.query(GbpPostKeywordMapping)
            .filter(GbpPostKeywordMapping.campaign_cycle_id == cycle.id)
            .order_by(GbpPostKeywordMapping.publish_date.asc())
            .all()
        )
        scans = (
            self.db.query(GeoGridScan)
            .filter(GeoGridScan.campaign_cycle_id == cycle.id)
            .all()
        )
        if scans:
            scan_points = (
                self.db.query(GeoGridScanPoint)
                .filter(GeoGridScanPoint.geo_grid_scan_id.in_([scan.id for scan in scans]))
                .all()
            )
        else:
            scan_points = []
        points_by_scan: dict[uuid.UUID, list[GeoGridScanPoint]] = defaultdict(list)
        for point in scan_points:
            points_by_scan[point.geo_grid_scan_id].append(point)
        scans_by_keyword: dict[str, dict[str, GeoGridScan]] = defaultdict(dict)
        for scan in scans:
            scans_by_keyword[scan.keyword][scan.scan_type] = scan

        keyword_rows: list[dict[str, Any]] = []
        opportunities: dict[str, list[dict[str, Any]]] = {
            "high_ticket_opportunities": [],
            "easy_win_low_competition": [],
            "service_area_expansion": [],
            "underperforming_high_value_terms": [],
        }
        for row in selected_keywords:
            baseline = scans_by_keyword.get(row.keyword, {}).get("baseline")
            followup = scans_by_keyword.get(row.keyword, {}).get("followup")
            baseline_rank = baseline.average_rank if baseline else row.current_rank
            latest_rank = followup.average_rank if followup else baseline_rank
            rank_change = (
                round(float(baseline_rank) - float(latest_rank), 2)
                if baseline_rank is not None and latest_rank is not None
                else None
            )
            keyword_rows.append(
                {
                    "id": str(row.id),
                    "business_service_id": str(row.business_service_id) if row.business_service_id else None,
                    "service_name": row.business_service.name if row.business_service else None,
                    "keyword": row.keyword,
                    "target_city_or_area": row.target_service_area,
                    "search_volume": row.search_volume,
                    "average_cpc_micros": row.average_cpc_micros,
                    "top_of_page_bid_low_micros": row.top_of_page_bid_low_micros,
                    "top_of_page_bid_high_micros": row.top_of_page_bid_high_micros,
                    "competition_index": row.competition_index,
                    "service_value_cents": row.service_value_cents,
                    "intent_level": row.intent_level,
                    "competition_level": row.competition_level,
                    "status": row.status,
                    "is_active": row.is_active,
                    "is_primary": row.is_primary,
                    "baseline_rank": baseline_rank,
                    "latest_rank": latest_rank,
                    "rank_change": rank_change,
                    "why_selected": row.why_selected,
                    "classifications": row.classifications_json or [],
                    "score_breakdown": row.score_breakdown_json or {},
                }
            )
            classifications = set(row.classifications_json or [])
            if "high_ticket_opportunity" in classifications:
                opportunities["high_ticket_opportunities"].append(
                    {"keyword": row.keyword, "reason": row.why_selected}
                )
            if "low_competition_opportunity" in classifications:
                opportunities["easy_win_low_competition"].append(
                    {"keyword": row.keyword, "reason": row.why_selected}
                )
            if "service_area_opportunity" in classifications:
                opportunities["service_area_expansion"].append(
                    {"keyword": row.keyword, "reason": row.why_selected}
                )
            if "move_to_top3_opportunity" in classifications:
                opportunities["underperforming_high_value_terms"].append(
                    {"keyword": row.keyword, "reason": row.why_selected}
                )

        geo_payload: dict[str, Any] = {}
        for keyword, per_type in scans_by_keyword.items():
            baseline = per_type.get("baseline")
            followup = per_type.get("followup")
            geo_payload[keyword] = {
                "baseline": self._serialize_scan(baseline, points_by_scan.get(baseline.id, [])) if baseline else None,
                "followup": self._serialize_scan(followup, points_by_scan.get(followup.id, [])) if followup else None,
                "delta": self._scan_delta(baseline, followup),
            }

        history_rows = (
            self.db.query(KeywordDashboardAggregate)
            .filter(
                KeywordDashboardAggregate.organization_id == organization_id,
                KeywordDashboardAggregate.location_id == location_id,
            )
            .order_by(KeywordDashboardAggregate.created_at.desc())
            .limit(18)
            .all()
        )
        history = [
            {
                "cycle_id": str(item.campaign_cycle_id),
                "cycle_label": item.cycle_label,
                "avg_baseline_rank": item.avg_baseline_rank,
                "avg_followup_rank": item.avg_followup_rank,
                "avg_rank_change": item.avg_rank_change,
                "posts_generated_from_keywords": item.posts_generated_from_keywords,
                "gbp_updates_applied": item.gbp_updates_applied,
            }
            for item in history_rows
        ]

        audit = self._build_audit_payload(cycle=cycle)

        return {
            "has_data": True,
            "cycle": {
                "id": str(cycle.id),
                "cycle_year": cycle.cycle_year,
                "cycle_month": cycle.cycle_month,
                "trigger_source": cycle.trigger_source,
                "status": cycle.status,
                "followup_due_at": cycle.followup_due_at,
                "baseline_scanned_at": cycle.baseline_scanned_at,
                "followup_scanned_at": cycle.followup_scanned_at,
            },
            "overview": {
                "cycle_month": f"{calendar.month_name[cycle.cycle_month]} {cycle.cycle_year}",
                "target_keywords": aggregate.target_keywords_count if aggregate else len(selected_keywords),
                "avg_baseline_rank": aggregate.avg_baseline_rank if aggregate else None,
                "avg_followup_rank": aggregate.avg_followup_rank if aggregate else None,
                "avg_improvement": aggregate.avg_rank_change if aggregate else None,
                "posts_generated": aggregate.posts_generated_from_keywords if aggregate else len(mappings),
                "gbp_updates_applied": aggregate.gbp_updates_applied if aggregate else 0,
                "visibility_baseline": aggregate.visibility_baseline if aggregate else None,
                "visibility_followup": aggregate.visibility_followup if aggregate else None,
            },
            "keywords": keyword_rows,
            "opportunities": opportunities,
            "gbp_actions": [
                {
                    "id": str(action.id),
                    "action_type": action.action_type,
                    "status": action.status,
                    "source_keywords": action.source_keywords or [],
                    "before_value": action.before_value or {},
                    "after_value": action.after_value or {},
                    "applied_at": action.applied_at,
                    "notes": action.notes,
                }
                for action in actions
            ],
            "post_plan": [
                {
                    "id": str(item.id),
                    "campaign_cycle_id": str(item.campaign_cycle_id),
                    "business_service_id": str(item.business_service_id) if item.business_service_id else None,
                    "service_name": item.service_name,
                    "target_keyword": item.target_keyword,
                    "secondary_keywords": item.secondary_keywords or [],
                    "post_angle": item.post_angle,
                    "post_type": item.post_type,
                    "cta": item.cta,
                    "suggested_image_theme": item.suggested_image_theme,
                    "proximity_target": item.proximity_target,
                    "proximity_source": item.proximity_source,
                    "media_asset_id": str(item.media_asset_id) if item.media_asset_id else None,
                    "generated_at": item.created_at.isoformat() if item.created_at else None,
                    "publish_date": item.publish_date.isoformat(),
                    "status": item.status,
                    "post_id": str(item.post_id) if item.post_id else None,
                    "metadata": item.metadata_json or {},
                }
                for item in mappings
            ],
            "geo_grid": geo_payload,
            "history": history,
            "audit": audit,
            "data_sources": cycle.data_sources_json or {},
        }

    def _start_job_run(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        dedupe_key: str,
        job_type: str,
        triggered_by: str,
    ) -> CampaignJobRun | None:
        existing = (
            self.db.query(CampaignJobRun)
            .filter(CampaignJobRun.dedupe_key == dedupe_key)
            .one_or_none()
        )
        now = datetime.now(timezone.utc)
        if existing:
            if existing.status == "running":
                return None
            if existing.status == "completed":
                return None
            existing.status = "running"
            existing.started_at = now
            existing.finished_at = None
            existing.error = None
            existing.attempts = (existing.attempts or 0) + 1
            existing.triggered_by = triggered_by
            self.db.add(existing)
            self.db.commit()
            self.db.refresh(existing)
            return existing

        run = CampaignJobRun(
            organization_id=organization_id,
            location_id=location_id,
            campaign_cycle_id=None,
            job_type=job_type,
            status="running",
            triggered_by=triggered_by,
            dedupe_key=dedupe_key,
            started_at=now,
            attempts=1,
        )
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)
        return run

    def _finish_job_run(
        self,
        run: CampaignJobRun,
        *,
        status: str,
        details: dict | None = None,
        error: str | None = None,
    ) -> None:
        run.status = status
        run.finished_at = datetime.now(timezone.utc)
        if details:
            run.details_json = details
        if error:
            run.error = error[:1000]
        self.db.add(run)
        self.db.commit()

    def _existing_cycle(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        cycle_year: int,
        cycle_month: int,
    ) -> KeywordCampaignCycle | None:
        return (
            self.db.query(KeywordCampaignCycle)
            .filter(
                KeywordCampaignCycle.organization_id == organization_id,
                KeywordCampaignCycle.location_id == location_id,
                KeywordCampaignCycle.cycle_year == cycle_year,
                KeywordCampaignCycle.cycle_month == cycle_month,
            )
            .one_or_none()
        )

    def _get_or_create_cycle(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        cycle_year: int,
        cycle_month: int,
        trigger_source: str,
        onboarding_triggered: bool,
    ) -> KeywordCampaignCycle:
        cycle = self._existing_cycle(
            organization_id=organization_id,
            location_id=location_id,
            cycle_year=cycle_year,
            cycle_month=cycle_month,
        )
        if cycle:
            if onboarding_triggered:
                cycle.onboarding_triggered = True
            if cycle.trigger_source != "onboarding" and trigger_source == "onboarding":
                cycle.trigger_source = trigger_source
            self.db.add(cycle)
            self.db.commit()
            self.db.refresh(cycle)
            return cycle
        cycle = KeywordCampaignCycle(
            organization_id=organization_id,
            location_id=location_id,
            cycle_year=cycle_year,
            cycle_month=cycle_month,
            trigger_source=trigger_source,
            status="queued",
            onboarding_triggered=onboarding_triggered,
        )
        self.db.add(cycle)
        self.db.commit()
        self.db.refresh(cycle)
        return cycle

    def _clear_cycle_children(self, cycle_id: uuid.UUID) -> None:
        scan_ids = [row.id for row in self.db.query(GeoGridScan).filter(GeoGridScan.campaign_cycle_id == cycle_id).all()]
        if scan_ids:
            (
                self.db.query(GeoGridScanPoint)
                .filter(GeoGridScanPoint.geo_grid_scan_id.in_(scan_ids))
                .delete(synchronize_session=False)
            )
        self.db.query(GeoGridScan).filter(GeoGridScan.campaign_cycle_id == cycle_id).delete(synchronize_session=False)
        self.db.query(GbpPostKeywordMapping).filter(
            GbpPostKeywordMapping.campaign_cycle_id == cycle_id
        ).delete(synchronize_session=False)
        self.db.query(GbpOptimizationAction).filter(
            GbpOptimizationAction.campaign_cycle_id == cycle_id
        ).delete(synchronize_session=False)
        self.db.query(SelectedKeyword).filter(
            SelectedKeyword.campaign_cycle_id == cycle_id
        ).delete(synchronize_session=False)
        self.db.query(KeywordScore).filter(
            KeywordScore.campaign_cycle_id == cycle_id
        ).delete(synchronize_session=False)
        self.db.query(KeywordCandidate).filter(
            KeywordCandidate.campaign_cycle_id == cycle_id
        ).delete(synchronize_session=False)
        self.db.query(KeywordDashboardAggregate).filter(
            KeywordDashboardAggregate.campaign_cycle_id == cycle_id
        ).delete(synchronize_session=False)
        self.db.commit()

    def _build_discovery_context(self, *, organization_id: uuid.UUID, location: Location) -> DiscoveryContext:
        settings_json = dict(location.settings.settings_json or {}) if location.settings else {}
        primary_category = self._first_non_empty(
            [
                self._safe_str((location.address or {}).get("primaryCategory")),
                self._safe_str((location.address or {}).get("category")),
                self._safe_str(settings_json.get("business_type")),
            ]
        )
        secondary_categories = self._listify((location.address or {}).get("secondary_categories")) + self._listify(
            settings_json.get("secondary_categories")
        )
        services = self._extract_services(location)
        city = self._first_non_empty(
            [
                self._safe_str((location.address or {}).get("city")),
                self._safe_str((location.address or {}).get("locality")),
            ]
        )
        state = self._first_non_empty(
            [
                self._safe_str((location.address or {}).get("state")),
                self._safe_str((location.address or {}).get("administrativeArea")),
            ]
        )
        gbp_service_area_cities = [
            item["target"]
            for item in self._gbp_proximity_targets(location)
            if item.get("source") == "gbp_service_area"
        ]
        configured_service_area = []
        if settings_json.get("service_area_source") == "gbp":
            configured_service_area = self._listify(settings_json.get("service_area_cities")) + self._listify(
                settings_json.get("service_area")
            )
        service_area_cities = self._dedupe_preserve(gbp_service_area_cities + configured_service_area)
        existing_description = self._first_non_empty(
            [
                self._safe_str(settings_json.get("gbp_description")),
                self._safe_str(settings_json.get("business_description")),
            ]
        )
        website_url = self._first_non_empty(
            [
                self._safe_str(settings_json.get("website_url")),
                self._safe_str((location.external_ids or {}).get("website_url")),
            ]
        )
        historical_keywords = self._historical_keywords(location_id=location.id)
        gbp_search_terms = [
            str(item.get("term")).strip().lower()
            for item in self.gbp_insights.get_search_terms(
                organization_id=organization_id,
                location=location,
                limit=60,
            )
            if item.get("term")
        ]
        current_rank_map = self.rank_insights.latest_rank_map(location_id=location.id)
        merged_settings = self.settings.merged(organization_id=organization_id, location_id=location.id)
        configured_weights = merged_settings.get("keyword_scoring_weights") if isinstance(merged_settings, dict) else {}
        scoring_weights = self._resolve_scoring_weights(configured_weights)
        return DiscoveryContext(
            primary_category=primary_category,
            secondary_categories=self._dedupe_preserve(secondary_categories),
            services=self._dedupe_preserve(services),
            city=city,
            state=state,
            service_area_cities=self._dedupe_preserve(service_area_cities),
            existing_description=existing_description,
            website_url=website_url,
            historical_keywords=self._dedupe_preserve(historical_keywords),
            gbp_search_terms=self._dedupe_preserve(gbp_search_terms),
            current_rank_map=current_rank_map,
            scoring_weights=scoring_weights,
        )

    def _score_candidates(
        self,
        *,
        location: Location,
        context: DiscoveryContext,
        business_services: list[BusinessService],
    ) -> list[ScoredCandidate]:
        scored: list[ScoredCandidate] = []
        for business_service in business_services:
            candidates = self._build_candidate_pool(
                location=location,
                context=context,
                business_service=business_service,
            )
            metrics = self.keyword_data_provider.fetch_service_keyword_ideas(
                location=location,
                service_name=business_service.name,
                seed_keywords=[candidate["keyword"] for candidate in candidates],
                page_url=context.website_url,
                max_results=140,
            )
            candidate_lookup = {candidate["normalized_keyword"]: candidate for candidate in candidates}
            for keyword, metric in metrics.items():
                normalized = self._normalize_keyword(keyword)
                candidate = candidate_lookup.get(normalized)
                if not candidate:
                    candidate = self._candidate_payload(
                        keyword=keyword,
                        candidate_type="provider_idea",
                        source_tag=metric.provider,
                        business_service=business_service,
                        target_area=context.city,
                    )
                current_rank = self._resolve_rank(context.current_rank_map, keyword)
                scored.append(
                    self._score_single_candidate(
                        candidate=candidate,
                        context=context,
                        search_volume=metric.search_volume,
                        competition=metric.competition,
                        current_rank=current_rank,
                        metric=metric,
                        business_service=business_service,
                    )
                )
        scored.sort(key=lambda item: item.overall_score, reverse=True)
        return scored

    def _build_candidate_pool(
        self,
        *,
        location: Location,
        context: DiscoveryContext,
        business_service: BusinessService,
    ) -> list[dict[str, Any]]:
        pool: dict[str, dict[str, Any]] = {}
        services = [business_service.name]
        city = context.city
        state = context.state
        for service in services:
            service = self._clean_term(service)
            if not service:
                continue
            self._add_candidate(
                pool,
                keyword=service,
                candidate_type="core_service",
                source_tag="service",
                business_service=business_service,
            )
            if city:
                self._add_candidate(
                    pool,
                    keyword=f"{service} {city}",
                    candidate_type="service_city",
                    source_tag="service_city",
                    business_service=business_service,
                    target_area=city,
                )
            if city and state:
                self._add_candidate(
                    pool,
                    keyword=f"{service} {city} {state}",
                    candidate_type="service_city_state",
                    source_tag="service_city_state",
                    business_service=business_service,
                    target_area=city,
                )
            self._add_candidate(
                pool,
                keyword=f"{service} near me",
                candidate_type="near_me",
                source_tag="near_me",
                business_service=business_service,
                target_area=city,
            )
            for modifier in ["emergency", "repair", "replacement", "installation"]:
                self._add_candidate(
                    pool,
                        keyword=f"{modifier} {service}",
                        candidate_type="intent_variant",
                        source_tag="intent_variant",
                        business_service=business_service,
                    )
                if city:
                    self._add_candidate(
                        pool,
                        keyword=f"{modifier} {service} {city}",
                        candidate_type="intent_city_variant",
                        source_tag="intent_city_variant",
                        business_service=business_service,
                        target_area=city,
                    )
            for service_city in context.service_area_cities:
                service_city = self._clean_term(service_city)
                if not service_city:
                    continue
                self._add_candidate(
                    pool,
                    keyword=f"{service} {service_city}",
                    candidate_type="service_area",
                    source_tag="service_area_city",
                    business_service=business_service,
                    target_area=service_city,
                )
                self._add_candidate(
                    pool,
                    keyword=f"emergency {service} {service_city}",
                    candidate_type="service_area_intent",
                    source_tag="service_area_city",
                    business_service=business_service,
                    target_area=service_city,
                )

        for term in context.gbp_search_terms:
            if not term:
                continue
            if not self._term_matches_service(term, business_service.name):
                continue
            self._add_candidate(
                pool,
                keyword=term,
                candidate_type="gbp_insight_term",
                source_tag="gbp_insight",
                business_service=business_service,
                target_area=city,
            )
            if city and city.lower() not in term.lower():
                self._add_candidate(
                    pool,
                    keyword=f"{term} {city}",
                    candidate_type="gbp_insight_city_variant",
                    source_tag="gbp_insight",
                    business_service=business_service,
                    target_area=city,
                )

        for historical in context.historical_keywords:
            if not self._term_matches_service(historical, business_service.name):
                continue
            self._add_candidate(
                pool,
                keyword=historical,
                candidate_type="historical",
                source_tag="historical",
                business_service=business_service,
                target_area=city,
            )

        deduped = list(pool.values())
        deduped.sort(key=lambda item: item["keyword"])
        return deduped[:220]

    def _score_single_candidate(
        self,
        *,
        candidate: dict[str, Any],
        context: DiscoveryContext,
        search_volume: int,
        competition: float,
        current_rank: float | None,
        metric: KeywordMarketMetric,
        business_service: BusinessService,
    ) -> ScoredCandidate:
        keyword = candidate["keyword"]
        normalized = candidate["normalized_keyword"]
        relevance = self._relevance_score(keyword=normalized, context=context, target_area=candidate.get("target_service_area"))
        volume_score = min(100.0, (max(0, search_volume) / 350.0) * 100.0)
        intent_score = self._intent_score(normalized)
        service_value_cents = business_service.service_value_cents or self._estimated_service_value_cents(normalized)
        ticket_score = self._ticket_value_score(normalized, service_value_cents=service_value_cents)
        competition_score = max(0.0, min(100.0, competition * 100.0))
        value_score, formula = self._value_based_score(
            search_volume=search_volume,
            metric=metric,
            competition=competition,
            service_value_cents=service_value_cents,
        )
        opportunity = self._opportunity_score(current_rank=current_rank, target_area=candidate.get("target_service_area"), city=context.city)
        current_rank_score = self._current_rank_score(current_rank)
        already_dominant_penalty = 22.0 if current_rank is not None and current_rank <= 3.0 else 0.0

        weights = context.scoring_weights
        overall = (
            value_score * weights["value"]
            + relevance * weights["relevance"]
            + intent_score * weights["intent"]
            + ticket_score * weights["ticket_value"]
            + volume_score * weights["search_volume"]
            + opportunity * weights["opportunity"]
            + current_rank_score * weights["current_rank"]
            - competition_score * weights["competition_penalty"]
            - already_dominant_penalty * weights["already_dominant_penalty"]
        )
        classifications = self._classifications(
            target_area=candidate.get("target_service_area"),
            city=context.city,
            ticket_score=ticket_score,
            value_score=value_score,
            competition_score=competition_score,
            current_rank=current_rank,
            opportunity_score=opportunity,
        )
        why_selected = self._selection_explanation(
            search_volume=search_volume,
            competition_score=competition_score,
            classifications=classifications,
            current_rank=current_rank,
        )
        return ScoredCandidate(
            business_service_id=business_service.id,
            service_name=business_service.name,
            keyword=keyword,
            normalized_keyword=normalized,
            cluster_key=candidate["cluster_key"],
            target_service_area=candidate.get("target_service_area"),
            candidate_type=candidate.get("candidate_type"),
            source_tags=list(candidate.get("source_tags") or []),
            relevance_score=round(relevance, 2),
            local_volume_score=round(volume_score, 2),
            intent_score=round(intent_score, 2),
            ticket_value_score=round(ticket_score, 2),
            value_score=round(value_score, 2),
            competition_score=round(competition_score, 2),
            opportunity_score=round(opportunity, 2),
            current_rank_score=round(current_rank_score, 2),
            already_dominant_penalty=round(already_dominant_penalty, 2),
            overall_score=round(overall, 2),
            search_volume=search_volume,
            average_cpc_micros=metric.average_cpc_micros,
            top_of_page_bid_low_micros=metric.top_of_page_bid_low_micros,
            top_of_page_bid_high_micros=metric.top_of_page_bid_high_micros,
            competition_estimate=round(competition, 4),
            competition_index=metric.competition_index,
            competition_level=metric.competition_level,
            current_rank=round(current_rank, 2) if current_rank is not None else None,
            service_value_cents=service_value_cents,
            provider=metric.provider,
            source_query={**metric.source_query, "value_formula": formula},
            classifications=classifications,
            why_selected=why_selected,
        )

    def _select_candidates_by_service(
        self,
        *,
        scored: list[ScoredCandidate],
        business_services: list[BusinessService],
        previous_active: list[SelectedKeyword],
    ) -> tuple[list[ScoredCandidate], set[uuid.UUID], set[uuid.UUID]]:
        per_service: dict[uuid.UUID, list[ScoredCandidate]] = defaultdict(list)
        for candidate in scored:
            if candidate.business_service_id:
                per_service[candidate.business_service_id].append(candidate)

        previous_by_service: dict[uuid.UUID, list[SelectedKeyword]] = defaultdict(list)
        for previous in previous_active:
            if previous.business_service_id:
                previous_by_service[previous.business_service_id].append(previous)

        selected: list[ScoredCandidate] = []
        retained_previous_ids: set[uuid.UUID] = set()
        replaced_previous_ids: set[uuid.UUID] = set()
        min_per_service = max(1, int(settings.KEYWORDS_PER_SERVICE_MIN))
        max_per_service = max(min_per_service, int(settings.KEYWORDS_PER_SERVICE_MAX))

        for business_service in business_services:
            candidates = sorted(
                per_service.get(business_service.id, []),
                key=lambda item: item.overall_score,
                reverse=True,
            )
            if not candidates:
                continue
            slots = min(max_per_service, max(min_per_service, len(candidates)))
            service_selected: list[ScoredCandidate] = []
            selected_norms: set[str] = set()
            selected_clusters: set[str] = set()

            for previous in sorted(
                previous_by_service.get(business_service.id, []),
                key=lambda row: self._keyword_performance_score(row),
                reverse=True,
            ):
                if len(service_selected) >= slots:
                    break
                performance = self._keyword_performance_score(previous)
                if performance < settings.KEYWORD_RETAIN_PERFORMANCE_THRESHOLD:
                    replaced_previous_ids.add(previous.id)
                    continue
                retained = self._matching_or_retained_candidate(
                    previous=previous,
                    candidates=candidates,
                    business_service=business_service,
                    performance=performance,
                )
                if retained.normalized_keyword in selected_norms:
                    continue
                service_selected.append(retained)
                selected_norms.add(retained.normalized_keyword)
                selected_clusters.add(retained.cluster_key)
                retained_previous_ids.add(previous.id)

            for candidate in candidates:
                if len(service_selected) >= slots:
                    break
                if candidate.normalized_keyword in selected_norms:
                    continue
                if candidate.cluster_key in selected_clusters and candidate.overall_score < candidates[0].overall_score * 0.72:
                    continue
                if candidate.search_volume < 20 and candidate.intent_score < 45 and len(service_selected) < min_per_service:
                    continue
                service_selected.append(candidate)
                selected_norms.add(candidate.normalized_keyword)
                selected_clusters.add(candidate.cluster_key)

            for candidate in candidates:
                if len(service_selected) >= min_per_service:
                    break
                if candidate.normalized_keyword not in selected_norms:
                    service_selected.append(candidate)
                    selected_norms.add(candidate.normalized_keyword)

            selected.extend(service_selected[:slots])

            retained_for_service = {row.id for row in previous_by_service.get(business_service.id, [])} & retained_previous_ids
            for previous in previous_by_service.get(business_service.id, []):
                if previous.id not in retained_for_service:
                    replaced_previous_ids.add(previous.id)

        selected.sort(key=lambda item: (item.service_name or "", -item.overall_score))
        return selected, retained_previous_ids, replaced_previous_ids

    def _matching_or_retained_candidate(
        self,
        *,
        previous: SelectedKeyword,
        candidates: list[ScoredCandidate],
        business_service: BusinessService,
        performance: float,
    ) -> ScoredCandidate:
        normalized = self._normalize_keyword(previous.keyword)
        for candidate in candidates:
            if candidate.normalized_keyword == normalized:
                return ScoredCandidate(
                    **{
                        **candidate.__dict__,
                        "source_tags": self._dedupe_preserve([*candidate.source_tags, "retained"]),
                        "overall_score": max(candidate.overall_score, performance),
                        "retained_from_selected_keyword_id": previous.id,
                        "why_selected": "Retained because prior-cycle performance stayed above the replacement threshold.",
                    }
                )
        score_breakdown = previous.score_breakdown_json or {}
        return ScoredCandidate(
            business_service_id=business_service.id,
            service_name=business_service.name,
            keyword=previous.keyword,
            normalized_keyword=normalized,
            cluster_key=f"{business_service.id}:{self._cluster_key(normalized)}",
            target_service_area=previous.target_service_area,
            candidate_type="retained_active_keyword",
            source_tags=["retained", "previous_cycle"],
            relevance_score=float(score_breakdown.get("relevance_score") or 70.0),
            local_volume_score=float(score_breakdown.get("local_volume_score") or 50.0),
            intent_score=float(score_breakdown.get("intent_score") or 50.0),
            ticket_value_score=float(score_breakdown.get("ticket_value_score") or 50.0),
            value_score=float(score_breakdown.get("value_score") or min(100.0, performance)),
            competition_score=float(score_breakdown.get("competition_score") or 50.0),
            opportunity_score=float(score_breakdown.get("opportunity_score") or 50.0),
            current_rank_score=float(score_breakdown.get("current_rank_score") or 50.0),
            already_dominant_penalty=float(score_breakdown.get("already_dominant_penalty") or 0.0),
            overall_score=max(float(score_breakdown.get("overall_score") or performance), performance),
            search_volume=previous.search_volume or 0,
            average_cpc_micros=previous.average_cpc_micros,
            top_of_page_bid_low_micros=previous.top_of_page_bid_low_micros,
            top_of_page_bid_high_micros=previous.top_of_page_bid_high_micros,
            competition_estimate=float(previous.competition_estimate or 0.5),
            competition_index=previous.competition_index,
            competition_level=previous.competition_level,
            current_rank=previous.current_rank,
            service_value_cents=previous.service_value_cents,
            provider="retained_previous_cycle",
            source_query={"previous_selected_keyword_id": str(previous.id), "performance_score": performance},
            classifications=self._dedupe_preserve([*(previous.classifications_json or []), "retained"]),
            why_selected="Retained because prior-cycle performance stayed above the replacement threshold.",
            retained_from_selected_keyword_id=previous.id,
        )

    def _previous_active_keywords(self, *, location_id: uuid.UUID) -> list[SelectedKeyword]:
        return (
            self.db.query(SelectedKeyword)
            .filter(SelectedKeyword.location_id == location_id)
            .filter(SelectedKeyword.is_active == True)  # noqa: E712
            .filter(SelectedKeyword.status == "active")
            .order_by(SelectedKeyword.created_at.desc())
            .all()
        )

    def _keyword_performance_score(self, row: SelectedKeyword) -> float:
        performance = dict(row.performance_json or {})
        explicit = performance.get("performance_score")
        if isinstance(explicit, (int, float)):
            return float(explicit)
        score = float((row.score_breakdown_json or {}).get("overall_score") or 50.0)
        if row.current_rank is not None:
            if row.current_rank <= 3:
                score += 16
            elif row.current_rank <= 6:
                score += 8
            elif row.current_rank > 12:
                score -= 12
        published_posts = (
            self.db.query(GbpPostKeywordMapping)
            .filter(
                GbpPostKeywordMapping.selected_keyword_id == row.id,
                GbpPostKeywordMapping.status == "published",
            )
            .count()
        )
        score += min(12, published_posts * 4)
        return max(0.0, min(100.0, round(score, 2)))

    def _deactivate_previous_keywords(
        self,
        *,
        previous_active: list[SelectedKeyword],
        retained_previous_ids: set[uuid.UUID],
        replaced_previous_ids: set[uuid.UUID],
    ) -> None:
        now = datetime.now(timezone.utc)
        for previous in previous_active:
            previous.is_active = False
            previous.active_until = now
            if previous.id in retained_previous_ids:
                previous.status = "retained"
                previous.replacement_reason = "Retained into a newer cycle; superseded by current active row."
            elif previous.id in replaced_previous_ids:
                previous.status = "replaced"
                previous.replacement_reason = "Below performance threshold or outscored by new service candidates."
            else:
                previous.status = "inactive"
                previous.replacement_reason = "Deactivated by newer keyword campaign cycle."
            self.db.add(previous)
        if previous_active:
            self.db.commit()

    def _persist_keyword_candidates_and_scores(
        self,
        *,
        cycle: KeywordCampaignCycle,
        location: Location,
        scored_candidates: list[ScoredCandidate],
        selected: list[ScoredCandidate],
        score_weights: dict[str, float],
    ) -> list[SelectedKeyword]:
        persist_candidates = list(scored_candidates)
        scored_keys = {(item.business_service_id, item.normalized_keyword) for item in persist_candidates}
        for item in selected:
            key = (item.business_service_id, item.normalized_keyword)
            if key not in scored_keys:
                persist_candidates.append(item)
                scored_keys.add(key)
        selected_lookup = {
            (item.business_service_id, item.normalized_keyword): index + 1
            for index, item in enumerate(selected)
        }
        selected_item_lookup = {
            (item.business_service_id, item.normalized_keyword): item
            for item in selected
        }
        service_rank_order_lookup: dict[tuple[uuid.UUID | None, str], int] = {}
        service_counts: dict[uuid.UUID | None, int] = defaultdict(int)
        for item in selected:
            key = (item.business_service_id, item.normalized_keyword)
            service_counts[item.business_service_id] += 1
            service_rank_order_lookup[key] = service_counts[item.business_service_id]
        selected_rows: list[SelectedKeyword] = []
        for scored in persist_candidates:
            selected_key = (scored.business_service_id, scored.normalized_keyword)
            is_selected = selected_key in selected_lookup
            row_data = selected_item_lookup.get(selected_key, scored) if is_selected else scored
            candidate = KeywordCandidate(
                organization_id=cycle.organization_id,
                location_id=cycle.location_id,
                campaign_cycle_id=cycle.id,
                business_service_id=row_data.business_service_id,
                keyword=row_data.keyword,
                normalized_keyword=row_data.normalized_keyword,
                cluster_key=row_data.cluster_key,
                target_service_area=row_data.target_service_area,
                candidate_type=row_data.candidate_type,
                source_tags=row_data.source_tags,
                provider=row_data.provider,
                source_query_json=row_data.source_query,
                avg_monthly_searches=row_data.search_volume,
                average_cpc_micros=row_data.average_cpc_micros,
                top_of_page_bid_low_micros=row_data.top_of_page_bid_low_micros,
                top_of_page_bid_high_micros=row_data.top_of_page_bid_high_micros,
                competition_index=row_data.competition_index,
                competition_level=row_data.competition_level,
                rejection_reason=None if is_selected else "Lower score or duplicate cluster than selected set",
                is_selected=is_selected,
            )
            self.db.add(candidate)
            self.db.flush()

            score = KeywordScore(
                organization_id=cycle.organization_id,
                location_id=cycle.location_id,
                campaign_cycle_id=cycle.id,
                candidate_id=candidate.id,
                business_service_id=row_data.business_service_id,
                relevance_score=row_data.relevance_score,
                local_volume_score=row_data.local_volume_score,
                intent_score=row_data.intent_score,
                ticket_value_score=row_data.ticket_value_score,
                value_score=row_data.value_score,
                competition_score=row_data.competition_score,
                opportunity_score=row_data.opportunity_score,
                current_rank_score=row_data.current_rank_score,
                already_dominant_penalty=row_data.already_dominant_penalty,
                overall_score=row_data.overall_score,
                search_volume=row_data.search_volume,
                average_cpc_micros=row_data.average_cpc_micros,
                top_of_page_bid_low_micros=row_data.top_of_page_bid_low_micros,
                top_of_page_bid_high_micros=row_data.top_of_page_bid_high_micros,
                competition_estimate=row_data.competition_estimate,
                competition_index=row_data.competition_index,
                current_rank=row_data.current_rank,
                service_value_cents=row_data.service_value_cents,
                score_weights_json=score_weights,
                score_formula_json=row_data.source_query.get("value_formula") if row_data.source_query else {},
                classifications_json=row_data.classifications,
                rationale=row_data.why_selected,
            )
            self.db.add(score)

            if is_selected:
                rank_order = selected_lookup[selected_key]
                service_rank_order = service_rank_order_lookup[selected_key]
                selected_row = SelectedKeyword(
                    organization_id=cycle.organization_id,
                    location_id=cycle.location_id,
                    campaign_cycle_id=cycle.id,
                    candidate_id=candidate.id,
                    business_service_id=row_data.business_service_id,
                    previous_selected_keyword_id=row_data.retained_from_selected_keyword_id,
                    rank_order=rank_order,
                    service_rank_order=service_rank_order,
                    keyword=row_data.keyword,
                    target_service_area=row_data.target_service_area,
                    search_volume=row_data.search_volume,
                    average_cpc_micros=row_data.average_cpc_micros,
                    top_of_page_bid_low_micros=row_data.top_of_page_bid_low_micros,
                    top_of_page_bid_high_micros=row_data.top_of_page_bid_high_micros,
                    competition_estimate=row_data.competition_estimate,
                    competition_index=row_data.competition_index,
                    current_rank=row_data.current_rank,
                    service_value_cents=row_data.service_value_cents,
                    intent_level=self._intent_label(row_data.intent_score),
                    competition_level=self._competition_label(row_data.competition_score),
                    selection_bucket=self._selection_bucket(row_data.classifications),
                    status="active",
                    is_active=True,
                    is_primary=service_rank_order == 1,
                    active_since=datetime.now(timezone.utc),
                    performance_json={},
                    why_selected=row_data.why_selected,
                    score_breakdown_json={
                        "relevance_score": row_data.relevance_score,
                        "local_volume_score": row_data.local_volume_score,
                        "intent_score": row_data.intent_score,
                        "ticket_value_score": row_data.ticket_value_score,
                        "value_score": row_data.value_score,
                        "competition_score": row_data.competition_score,
                        "opportunity_score": row_data.opportunity_score,
                        "current_rank_score": row_data.current_rank_score,
                        "already_dominant_penalty": row_data.already_dominant_penalty,
                        "overall_score": row_data.overall_score,
                    },
                    classifications_json=row_data.classifications,
                )
                self.db.add(selected_row)
                selected_rows.append(selected_row)
        self.db.commit()
        selected_rows.sort(key=lambda item: item.rank_order)
        return selected_rows

    def _sync_location_keyword_targets(
        self,
        *,
        location: Location,
        selected_keywords: list[SelectedKeyword],
    ) -> None:
        values = [item.keyword for item in sorted(selected_keywords, key=lambda row: row.rank_order)]
        by_service: dict[str, list[str]] = defaultdict(list)
        for item in sorted(selected_keywords, key=lambda row: row.rank_order):
            service_name = item.business_service.name if item.business_service else "Unmapped service"
            by_service[service_name].append(item.keyword)
        if not location.settings:
            location.settings = LocationSettings(
                tenant_id=location.tenant_id,
                location_id=location.id,
                keywords=values,
                settings_json={
                    "active_keyword_targets": values,
                    "service_active_keyword_targets": dict(by_service),
                },
            )
        else:
            location.settings.keywords = values
            settings_json = dict(location.settings.settings_json or {})
            settings_json["active_keyword_targets"] = values
            settings_json["service_active_keyword_targets"] = dict(by_service)
            settings_json["keyword_target_updated_at"] = datetime.now(timezone.utc).isoformat()
            location.settings.settings_json = settings_json
        self.db.add(location)
        self.db.commit()

    def _create_gbp_optimization_actions(
        self,
        *,
        cycle: KeywordCampaignCycle,
        location: Location,
        selected_keywords: list[SelectedKeyword],
        context: DiscoveryContext,
    ) -> None:
        top_keywords = [item.keyword for item in sorted(selected_keywords, key=lambda row: row.rank_order)]
        description_suggestion = self._profile_description_suggestion(
            location=location,
            context=context,
            top_keywords=top_keywords,
        )
        service_description_payloads = self._service_description_payloads(
            location=location,
            selected_keywords=selected_keywords,
            context=context,
        )
        action_specs = [
            {
                "action_type": "service_name_expansion",
                "status": "pending_review",
                "auto_apply": False,
                "before": {"services": context.services},
                "after": {"suggested_services": self._service_expansion_suggestions(top_keywords)},
                "keywords": top_keywords,
                "notes": "Normalize and expand service naming with selected keyword themes.",
            },
            {
                "action_type": "faq_qna_suggestions",
                "status": "recommended",
                "auto_apply": False,
                "before": {},
                "after": {"faq_prompts": self._faq_suggestions(top_keywords)},
                "keywords": top_keywords[:5],
                "notes": "Q&A opportunities mapped to high-intent search behavior.",
            },
            {
                "action_type": "review_response_guidance",
                "status": "applied",
                "auto_apply": True,
                "before": {},
                "after": {"guidance": self._review_response_guidance(top_keywords)},
                "keywords": top_keywords[:3],
                "notes": "Auto-applied as account guidance metadata.",
            },
            {
                "action_type": "monthly_post_themes",
                "status": "applied",
                "auto_apply": True,
                "before": {},
                "after": {"themes": self._post_theme_suggestions(top_keywords)},
                "keywords": top_keywords,
                "notes": "Feeds the monthly GBP posting plan.",
            },
            {
                "action_type": "image_caption_guidance",
                "status": "recommended",
                "auto_apply": False,
                "before": {},
                "after": {"captions": self._image_caption_suggestions(top_keywords)},
                "keywords": top_keywords[:4],
                "notes": "Photo caption suggestions tied to target service terms.",
            },
        ]
        if self._should_create_profile_description_refresh(location=location):
            action_specs.insert(
                0,
                {
                    "action_type": PROFILE_DESCRIPTION_ACTION_TYPE,
                    "status": "pending_review",
                    "auto_apply": False,
                    "before": {"description": context.existing_description},
                    "after": {"description": description_suggestion},
                    "keywords": top_keywords[:5],
                    "notes": (
                        "Light profile optimization suggestion. Core profile copy stays stable; "
                        "this action is throttled by profile refresh cadence."
                    ),
                },
            )

        for spec in action_specs:
            action = GbpOptimizationAction(
                organization_id=cycle.organization_id,
                location_id=cycle.location_id,
                campaign_cycle_id=cycle.id,
                selected_keyword_id=None,
                action_type=spec["action_type"],
                status=spec["status"],
                auto_apply_allowed=spec["auto_apply"],
                before_value=spec["before"],
                after_value=spec["after"],
                source_keywords=spec["keywords"],
                applied_at=datetime.now(timezone.utc) if spec["status"] == "applied" else None,
                notes=spec["notes"],
            )
            self.db.add(action)

        for payload in service_description_payloads:
            primary_selected_keyword_id = payload.get("primary_selected_keyword_id")
            action = GbpOptimizationAction(
                organization_id=cycle.organization_id,
                location_id=cycle.location_id,
                campaign_cycle_id=cycle.id,
                selected_keyword_id=(
                    uuid.UUID(primary_selected_keyword_id)
                    if isinstance(primary_selected_keyword_id, str) and primary_selected_keyword_id
                    else primary_selected_keyword_id
                ),
                action_type=SERVICE_DESCRIPTION_ACTION_TYPE,
                status="pending_review",
                auto_apply_allowed=False,
                before_value={
                    "business_service_id": payload.get("business_service_id"),
                    "service_name": payload.get("service_name"),
                    "description": payload.get("current_description"),
                },
                after_value={
                    "business_service_id": payload.get("business_service_id"),
                    "service_name": payload.get("service_name"),
                    "description": payload.get("suggested_description"),
                    "template_id": payload.get("template_id"),
                    "keywords": payload.get("keywords"),
                },
                source_keywords=payload.get("keywords") or [],
                notes="Template-generated service description using service-specific active keywords and location data.",
            )
            self.db.add(action)

        if location.settings:
            settings_json = dict(location.settings.settings_json or {})
            settings_json["keyword_strategy"] = {
                "cycle_id": str(cycle.id),
                "description_suggestion": description_suggestion,
                "service_description_suggestions": service_description_payloads,
                "review_response_guidance": self._review_response_guidance(top_keywords),
                "post_theme_suggestions": self._post_theme_suggestions(top_keywords),
            }
            location.settings.settings_json = settings_json
            self.db.add(location.settings)
        self.db.commit()

    def _create_monthly_post_plan(
        self,
        *,
        cycle: KeywordCampaignCycle,
        location: Location,
        selected_keywords: list[SelectedKeyword],
    ) -> None:
        ordered = sorted(
            [
                row
                for row in selected_keywords
                if row.is_active and row.status == "active" and row.business_service_id
            ],
            key=lambda row: row.rank_order,
        )
        if not ordered:
            return
        month_days = calendar.monthrange(cycle.cycle_year, cycle.cycle_month)[1]
        desired_posts = max(1, int(settings.KEYWORD_POSTS_PER_MONTH))
        post_count = max(1, min(month_days, desired_posts))
        interval = max(1, math.floor(month_days / post_count))
        publish_dates: list[date] = []
        cursor = date(cycle.cycle_year, cycle.cycle_month, 1)
        while len(publish_dates) < post_count:
            publish_dates.append(cursor)
            cursor = cursor + timedelta(days=interval)
            if cursor.month != cycle.cycle_month:
                cursor = date(cycle.cycle_year, cycle.cycle_month, month_days)
        service_groups: dict[uuid.UUID | None, list[SelectedKeyword]] = defaultdict(list)
        for keyword in ordered:
            service_groups[keyword.business_service_id].append(keyword)
        grouped_order = [
            group
            for _service_id, group in sorted(
                service_groups.items(),
                key=lambda item: min(row.rank_order for row in item[1]),
            )
        ]
        proximity_targets = self._gbp_proximity_targets(location)
        planned_media_counts: dict[uuid.UUID, int] = defaultdict(int)
        for idx, publish_date in enumerate(publish_dates):
            group = grouped_order[idx % len(grouped_order)]
            keyword_row = group[(idx // len(grouped_order)) % len(group)]
            use_proximity = bool(proximity_targets) and idx % 4 == 0
            proximity = proximity_targets[(idx // 4) % len(proximity_targets)] if use_proximity else None
            angle, post_type = (
                ("local_relevance_post", "update")
                if use_proximity
                else POST_ANGLE_ROTATION[idx % len(POST_ANGLE_ROTATION)]
            )
            service_name = keyword_row.business_service.name if keyword_row.business_service else None
            image_theme = self._image_theme_for_post(idx=idx, angle=angle, service_name=service_name)
            media_asset_id = self._select_monthly_media(
                location_id=location.id,
                service=service_name,
                theme=image_theme,
                planned_counts=planned_media_counts,
            )
            mapping = GbpPostKeywordMapping(
                organization_id=cycle.organization_id,
                location_id=cycle.location_id,
                campaign_cycle_id=cycle.id,
                selected_keyword_id=keyword_row.id,
                business_service_id=keyword_row.business_service_id,
                post_candidate_id=None,
                post_id=None,
                target_keyword=keyword_row.keyword,
                secondary_keywords=self._secondary_keyword_variations(keyword_row.keyword)[:2],
                service_name=service_name,
                post_angle=angle,
                post_type=post_type,
                cta=CTA_ROTATION[idx % len(CTA_ROTATION)],
                suggested_image_theme=image_theme,
                media_asset_id=media_asset_id,
                proximity_target=proximity["target"] if proximity else None,
                proximity_source=proximity["source"] if proximity else None,
                publish_date=publish_date,
                status="planned",
                metadata_json={
                    "post_mix": self._post_mix_label(angle),
                    "location_strategy": "proximity" if proximity else "none",
                    "keyword_group_index": idx,
                    "source": "keyword_campaign_monthly_batch",
                },
            )
            self.db.add(mapping)
        self.db.commit()

    def _gbp_proximity_targets(self, location: Location) -> list[dict[str, str]]:
        address = location.address or {}
        values: list[dict[str, str]] = []
        city = self._first_non_empty(
            [
                self._safe_str(address.get("city")),
                self._safe_str(address.get("locality")),
            ]
        )
        if city:
            values.append({"target": city, "source": "gbp_city"})
        service_area = address.get("serviceArea")
        area_values = self._service_area_values(service_area)
        for value in area_values:
            values.append({"target": value, "source": "gbp_service_area"})
        return self._dedupe_target_payloads(values)

    def _service_area_values(self, service_area: Any) -> list[str]:
        if not service_area:
            return []
        values: list[str] = []
        if isinstance(service_area, str):
            values.append(service_area)
        elif isinstance(service_area, list):
            values.extend(self._listify(service_area))
        elif isinstance(service_area, dict):
            values.extend(self._listify(service_area.get("places")))
            places = service_area.get("places") if isinstance(service_area.get("places"), dict) else {}
            values.extend(self._listify(places.get("placeInfos")))
        return self._dedupe_preserve(values)

    def _select_monthly_media(
        self,
        *,
        location_id: uuid.UUID,
        service: str | None,
        theme: str | None,
        planned_counts: dict[uuid.UUID, int],
    ) -> uuid.UUID | None:
        assets = self.db.query(MediaAsset).filter(MediaAsset.location_id == location_id).all()
        if not assets:
            return None
        service_tokens = self._token_set([service])
        theme_tokens = self._token_set([theme])

        def score(asset: MediaAsset) -> tuple[float, int, int, float]:
            tags = self._media_tags(asset)
            relevance = 0.0
            if service_tokens and service_tokens & tags:
                relevance += 3.0
            if theme_tokens and theme_tokens & tags:
                relevance += 2.0
            if not service_tokens and not theme_tokens:
                relevance += 1.0
            last_used = asset.last_used_at.timestamp() if asset.last_used_at else 0.0
            return (-relevance, planned_counts[asset.id], int(asset.usage_count or 0), last_used)

        selected = sorted(assets, key=score)[0]
        planned_counts[selected.id] += 1
        return selected.id

    def _media_tags(self, asset: MediaAsset) -> set[str]:
        values: list[str | None] = [asset.file_name, asset.description, asset.job_type, asset.season, asset.shot_stage]
        for item in asset.categories or []:
            values.append(str(item))
        metadata = asset.metadata_json or {}
        for item in metadata.get("tags") or metadata.get("service_tags") or []:
            values.append(str(item))
        return self._token_set(values)

    @staticmethod
    def _image_theme_for_post(*, idx: int, angle: str, service_name: str | None) -> str:
        if angle == "before_after_post":
            return "before-and-after"
        if angle == "trust_post":
            return "customer-success"
        if angle == "seasonal_post":
            return "seasonal-service-scene"
        if angle == "local_relevance_post":
            return "team-at-work"
        return service_name or IMAGE_THEME_ROTATION[idx % len(IMAGE_THEME_ROTATION)]

    @staticmethod
    def _post_mix_label(angle: str) -> str:
        return {
            "service_post": "service",
            "educational_post": "education",
            "seasonal_post": "seasonal",
            "trust_post": "social_proof",
            "before_after_post": "before_after",
            "offer_post": "promotion",
            "local_relevance_post": "proximity",
        }.get(angle, "service")

    @staticmethod
    def _dedupe_target_payloads(values: list[dict[str, str]]) -> list[dict[str, str]]:
        result: list[dict[str, str]] = []
        seen: set[str] = set()
        for item in values:
            target = str(item.get("target") or "").strip()
            if not target:
                continue
            key = target.lower()
            if key in seen:
                continue
            seen.add(key)
            result.append({"target": target, "source": item.get("source") or "gbp"})
        return result

    def _run_geo_grid_scans_for_cycle(
        self,
        *,
        cycle: KeywordCampaignCycle,
        selected_keywords: list[SelectedKeyword],
        scan_type: str,
    ) -> None:
        location = self.db.get(Location, cycle.location_id)
        if not location:
            raise ValueError("Location not found")
        grid_config = self._grid_config(location)
        for selected in selected_keywords:
            existing = (
                self.db.query(GeoGridScan)
                .filter(
                    GeoGridScan.campaign_cycle_id == cycle.id,
                    GeoGridScan.keyword == selected.keyword,
                    GeoGridScan.scan_type == scan_type,
                )
                .one_or_none()
            )
            if existing and existing.status == "completed":
                continue
            if existing:
                (
                    self.db.query(GeoGridScanPoint)
                    .filter(GeoGridScanPoint.geo_grid_scan_id == existing.id)
                    .delete(synchronize_session=False)
                )
                scan = existing
            else:
                scan = GeoGridScan(
                    organization_id=cycle.organization_id,
                    location_id=cycle.location_id,
                    campaign_cycle_id=cycle.id,
                    selected_keyword_id=selected.id,
                    keyword=selected.keyword,
                    scan_type=scan_type,
                    status="running",
                )
                self.db.add(scan)
                self.db.flush()
            result = self.geo_grid_provider.run_scan(
                location=location,
                keyword=selected.keyword,
                scan_type=scan_type,
                grid_config=grid_config,
                as_of=datetime.now(timezone.utc).date(),
            )
            ranks: list[int] = []
            visibility_sum = 0.0
            for point in result.points:
                rank_band, color_hex = self._rank_color(point.rank)
                if point.rank is not None:
                    ranks.append(point.rank)
                    visibility_sum += self._visibility_contribution(point.rank)
                entry = GeoGridScanPoint(
                    organization_id=cycle.organization_id,
                    location_id=cycle.location_id,
                    geo_grid_scan_id=scan.id,
                    row_index=point.row_index,
                    column_index=point.column_index,
                    latitude=point.latitude,
                    longitude=point.longitude,
                    rank=point.rank,
                    in_pack=point.rank is not None and point.rank <= 3,
                    competitor_name=point.competitor_name,
                    rank_band=rank_band,
                    color_hex=color_hex,
                    metadata_json={},
                )
                self.db.add(entry)
            total_points = len(result.points)
            scan.status = "completed"
            scan.scan_date = datetime.now(timezone.utc)
            scan.center_latitude = result.center_latitude
            scan.center_longitude = result.center_longitude
            scan.radius_miles = result.radius_miles
            scan.spacing_miles = result.spacing_miles
            scan.rows = result.rows
            scan.columns = result.columns
            scan.total_points = total_points
            scan.average_rank = round((sum(ranks) / len(ranks)), 2) if ranks else None
            scan.best_rank = min(ranks) if ranks else None
            scan.worst_rank = max(ranks) if ranks else None
            scan.visibility_score = round((visibility_sum / total_points) * 100.0, 2) if total_points else None
            scan.metadata_json = {"grid_config": grid_config}
            self.db.add(scan)
            self.db.flush()
        self.db.commit()

    def _schedule_followup_scan(self, cycle: KeywordCampaignCycle) -> None:
        run_at = cycle.followup_due_at or (datetime.now(timezone.utc) + timedelta(days=FOLLOWUP_SCAN_DELAY_DAYS))
        dedupe_key = f"keyword-followup-action:{cycle.id}"
        existing = (
            self.db.query(Action)
            .filter(Action.dedupe_key == dedupe_key)
            .one_or_none()
        )
        if existing:
            return
        self.action_service.schedule_action(
            organization_id=cycle.organization_id,
            action_type=ActionType.RUN_KEYWORD_FOLLOWUP_SCAN,
            run_at=run_at,
            payload={"cycle_id": str(cycle.id)},
            location_id=cycle.location_id,
            dedupe_key=dedupe_key,
        )

    def _rebuild_dashboard_aggregate(self, cycle: KeywordCampaignCycle) -> None:
        existing = (
            self.db.query(KeywordDashboardAggregate)
            .filter(KeywordDashboardAggregate.campaign_cycle_id == cycle.id)
            .one_or_none()
        )
        baseline_scans = (
            self.db.query(GeoGridScan)
            .filter(
                GeoGridScan.campaign_cycle_id == cycle.id,
                GeoGridScan.scan_type == "baseline",
            )
            .all()
        )
        followup_scans = (
            self.db.query(GeoGridScan)
            .filter(
                GeoGridScan.campaign_cycle_id == cycle.id,
                GeoGridScan.scan_type == "followup",
            )
            .all()
        )
        avg_baseline = self._average([item.average_rank for item in baseline_scans if item.average_rank is not None])
        avg_followup = self._average([item.average_rank for item in followup_scans if item.average_rank is not None])
        avg_rank_change = (
            round(avg_baseline - avg_followup, 2)
            if avg_baseline is not None and avg_followup is not None
            else None
        )
        visibility_baseline = self._average([item.visibility_score for item in baseline_scans if item.visibility_score is not None])
        visibility_followup = self._average([item.visibility_score for item in followup_scans if item.visibility_score is not None])
        visibility_change = (
            round(visibility_followup - visibility_baseline, 2)
            if visibility_baseline is not None and visibility_followup is not None
            else None
        )
        selected_count = (
            self.db.query(SelectedKeyword)
            .filter(SelectedKeyword.campaign_cycle_id == cycle.id)
            .count()
        )
        posts_generated = (
            self.db.query(GbpPostKeywordMapping)
            .filter(GbpPostKeywordMapping.campaign_cycle_id == cycle.id)
            .count()
        )
        actions_applied = (
            self.db.query(GbpOptimizationAction)
            .filter(
                GbpOptimizationAction.campaign_cycle_id == cycle.id,
                GbpOptimizationAction.status == "applied",
            )
            .count()
        )

        service_improvement = self._service_area_improvement(baseline_scans, followup_scans, cycle.id)
        edge_improvement = self._edge_improvement(baseline_scans, followup_scans, cycle.id)
        target = existing or KeywordDashboardAggregate(
            organization_id=cycle.organization_id,
            location_id=cycle.location_id,
            campaign_cycle_id=cycle.id,
            cycle_label=f"{calendar.month_name[cycle.cycle_month]} {cycle.cycle_year}",
        )
        target.target_keywords_count = selected_count
        target.avg_baseline_rank = avg_baseline
        target.avg_followup_rank = avg_followup
        target.avg_rank_change = avg_rank_change
        target.posts_generated_from_keywords = posts_generated
        target.gbp_updates_applied = actions_applied
        target.visibility_baseline = visibility_baseline
        target.visibility_followup = visibility_followup
        target.visibility_change = visibility_change
        target.service_area_improvement = service_improvement
        target.edge_of_grid_improvement = edge_improvement
        target.summary_json = {
            "baseline_scan_count": len(baseline_scans),
            "followup_scan_count": len(followup_scans),
        }
        self.db.add(target)
        self.db.commit()

    def _build_audit_payload(self, *, cycle: KeywordCampaignCycle) -> dict[str, Any]:
        selected = (
            self.db.query(SelectedKeyword)
            .filter(SelectedKeyword.campaign_cycle_id == cycle.id)
            .order_by(SelectedKeyword.rank_order.asc())
            .all()
        )
        selected_candidate_ids = {row.candidate_id for row in selected if row.candidate_id}
        rejected_query = (
            self.db.query(KeywordCandidate, KeywordScore)
            .join(KeywordScore, KeywordScore.candidate_id == KeywordCandidate.id)
            .filter(KeywordCandidate.campaign_cycle_id == cycle.id)
        )
        if selected_candidate_ids:
            rejected_query = rejected_query.filter(KeywordCandidate.id.notin_(selected_candidate_ids))
        rejected = rejected_query.order_by(KeywordScore.overall_score.desc()).limit(40).all()
        return {
            "selected_score_breakdowns": [
                {
                    "business_service_id": str(item.business_service_id) if item.business_service_id else None,
                    "service_name": item.business_service.name if item.business_service else None,
                    "keyword": item.keyword,
                    "why_selected": item.why_selected,
                    "classifications": item.classifications_json or [],
                    "score_breakdown": item.score_breakdown_json or {},
                }
                for item in selected
            ],
            "rejected_candidates": [
                {
                    "keyword": candidate.keyword,
                    "overall_score": score.overall_score,
                    "rejection_reason": candidate.rejection_reason,
                    "classifications": score.classifications_json or [],
                }
                for candidate, score in rejected
            ],
            "data_sources": cycle.data_sources_json or {},
        }

    def _serialize_scan(self, scan: GeoGridScan, points: list[GeoGridScanPoint]) -> dict[str, Any]:
        return {
            "id": str(scan.id),
            "scan_type": scan.scan_type,
            "scan_date": scan.scan_date,
            "keyword": scan.keyword,
            "average_rank": scan.average_rank,
            "best_rank": scan.best_rank,
            "worst_rank": scan.worst_rank,
            "visibility_score": scan.visibility_score,
            "total_points": scan.total_points,
            "grid": {
                "center_latitude": scan.center_latitude,
                "center_longitude": scan.center_longitude,
                "radius_miles": scan.radius_miles,
                "spacing_miles": scan.spacing_miles,
                "rows": scan.rows,
                "columns": scan.columns,
            },
            "cells": [
                {
                    "row": point.row_index,
                    "column": point.column_index,
                    "latitude": point.latitude,
                    "longitude": point.longitude,
                    "rank": point.rank,
                    "rank_band": point.rank_band,
                    "color_hex": point.color_hex,
                }
                for point in sorted(points, key=lambda row: (row.row_index, row.column_index))
            ],
        }

    @staticmethod
    def _scan_delta(baseline: GeoGridScan | None, followup: GeoGridScan | None) -> dict[str, Any] | None:
        if not baseline or not followup:
            return None
        avg_rank_delta = None
        if baseline.average_rank is not None and followup.average_rank is not None:
            avg_rank_delta = round(baseline.average_rank - followup.average_rank, 2)
        visibility_delta = None
        if baseline.visibility_score is not None and followup.visibility_score is not None:
            visibility_delta = round(followup.visibility_score - baseline.visibility_score, 2)
        return {
            "average_rank_delta": avg_rank_delta,
            "visibility_delta": visibility_delta,
        }

    @staticmethod
    def _average(values: Iterable[float | None]) -> float | None:
        filtered = [float(value) for value in values if value is not None]
        if not filtered:
            return None
        return round(sum(filtered) / len(filtered), 2)

    def _grid_config(self, location: Location) -> dict[str, Any]:
        settings_json = dict(location.settings.settings_json or {}) if location.settings else {}
        raw = settings_json.get("geo_grid_config") if isinstance(settings_json.get("geo_grid_config"), dict) else {}
        return {
            "center_latitude": location.latitude or raw.get("center_latitude") or 37.7749,
            "center_longitude": location.longitude or raw.get("center_longitude") or -122.4194,
            "radius_miles": float(raw.get("radius_miles") or 5.0),
            "spacing_miles": float(raw.get("spacing_miles") or 1.0),
            "rows": int(raw.get("rows") or 7),
            "columns": int(raw.get("columns") or 7),
        }

    def _service_area_improvement(
        self,
        baseline_scans: list[GeoGridScan],
        followup_scans: list[GeoGridScan],
        cycle_id: uuid.UUID,
    ) -> float | None:
        if not baseline_scans or not followup_scans:
            return None
        baseline_by_keyword = {scan.keyword: scan for scan in baseline_scans}
        followup_by_keyword = {scan.keyword: scan for scan in followup_scans}
        deltas: list[float] = []
        for keyword, baseline in baseline_by_keyword.items():
            followup = followup_by_keyword.get(keyword)
            if not followup:
                continue
            base_points = self._scan_points_for_center(baseline.id)
            follow_points = self._scan_points_for_center(followup.id)
            base_avg = self._average([point.rank for point in base_points if point.rank is not None])
            follow_avg = self._average([point.rank for point in follow_points if point.rank is not None])
            if base_avg is None or follow_avg is None:
                continue
            deltas.append(base_avg - follow_avg)
        return round(sum(deltas) / len(deltas), 2) if deltas else None

    def _edge_improvement(
        self,
        baseline_scans: list[GeoGridScan],
        followup_scans: list[GeoGridScan],
        cycle_id: uuid.UUID,
    ) -> float | None:
        if not baseline_scans or not followup_scans:
            return None
        baseline_by_keyword = {scan.keyword: scan for scan in baseline_scans}
        followup_by_keyword = {scan.keyword: scan for scan in followup_scans}
        deltas: list[float] = []
        for keyword, baseline in baseline_by_keyword.items():
            followup = followup_by_keyword.get(keyword)
            if not followup:
                continue
            base_points = self._scan_points_for_edge(baseline.id, rows=baseline.rows, columns=baseline.columns)
            follow_points = self._scan_points_for_edge(followup.id, rows=followup.rows, columns=followup.columns)
            base_avg = self._average([point.rank for point in base_points if point.rank is not None])
            follow_avg = self._average([point.rank for point in follow_points if point.rank is not None])
            if base_avg is None or follow_avg is None:
                continue
            deltas.append(base_avg - follow_avg)
        return round(sum(deltas) / len(deltas), 2) if deltas else None

    def _scan_points_for_center(self, scan_id: uuid.UUID) -> list[GeoGridScanPoint]:
        points = (
            self.db.query(GeoGridScanPoint)
            .filter(GeoGridScanPoint.geo_grid_scan_id == scan_id)
            .all()
        )
        if not points:
            return []
        max_row = max(point.row_index for point in points)
        max_col = max(point.column_index for point in points)
        center_row = max_row // 2
        center_col = max_col // 2
        result: list[GeoGridScanPoint] = []
        for point in points:
            if abs(point.row_index - center_row) <= 1 and abs(point.column_index - center_col) <= 1:
                result.append(point)
        return result

    def _scan_points_for_edge(self, scan_id: uuid.UUID, *, rows: int, columns: int) -> list[GeoGridScanPoint]:
        points = (
            self.db.query(GeoGridScanPoint)
            .filter(GeoGridScanPoint.geo_grid_scan_id == scan_id)
            .all()
        )
        edge_rows = {0, max(0, rows - 1)}
        edge_cols = {0, max(0, columns - 1)}
        return [
            point
            for point in points
            if point.row_index in edge_rows or point.column_index in edge_cols
        ]

    def _historical_keywords(self, *, location_id: uuid.UUID) -> list[str]:
        rows = (
            self.db.query(SelectedKeyword)
            .filter(SelectedKeyword.location_id == location_id)
            .order_by(SelectedKeyword.created_at.desc())
            .limit(200)
            .all()
        )
        return [row.keyword.lower() for row in rows]

    def _sync_business_services(self, location: Location) -> list[BusinessService]:
        service_entries = self._service_entries(location)
        if not service_entries:
            fallback = self._first_non_empty(
                [
                    self._safe_str((location.address or {}).get("primaryCategory")),
                    self._safe_str((location.address or {}).get("category")),
                    "local service",
                ]
            )
            service_entries = [{"name": fallback or "local service", "source": "fallback"}]

        existing = {
            row.normalized_name: row
            for row in self.db.query(BusinessService)
            .filter(
                BusinessService.organization_id == location.organization_id,
                BusinessService.location_id == location.id,
            )
            .all()
        }
        active_names: set[str] = set()
        rows: list[BusinessService] = []
        for entry in service_entries:
            name = self._clean_term(self._safe_str(entry.get("name")) or "")
            if not name:
                continue
            normalized = self._normalize_keyword(name)
            active_names.add(normalized)
            service_value_cents = self._service_value_cents_from_entry(entry, name)
            row = existing.get(normalized)
            if not row:
                row = BusinessService(
                    organization_id=location.organization_id,
                    location_id=location.id,
                    name=name,
                    normalized_name=normalized,
                    description=self._safe_str(entry.get("description")),
                    service_value_cents=service_value_cents,
                    source=self._safe_str(entry.get("source")) or "settings",
                    is_active=True,
                    metadata_json=self._service_metadata(entry),
                )
            else:
                row.name = name
                row.description = self._safe_str(entry.get("description")) or row.description
                row.service_value_cents = service_value_cents or row.service_value_cents
                row.is_active = True
                row.metadata_json = {**(row.metadata_json or {}), **self._service_metadata(entry)}
            self.db.add(row)
            rows.append(row)

        for normalized, row in existing.items():
            if normalized not in active_names:
                row.is_active = False
                self.db.add(row)

        self.db.commit()
        for row in rows:
            self.db.refresh(row)
        return [row for row in rows if row.is_active]

    def _service_entries(self, location: Location) -> list[dict[str, Any]]:
        if not location.settings or not location.settings.services:
            return []
        entries: list[dict[str, Any]] = []
        for item in location.settings.services:
            if isinstance(item, str):
                entries.append({"name": item, "source": "settings"})
            elif isinstance(item, dict):
                label = item.get("name") or item.get("title") or item.get("service")
                if isinstance(label, str):
                    entries.append({**item, "name": label})
        return entries

    def _service_value_cents_from_entry(self, entry: dict[str, Any], name: str) -> int:
        for key in ("service_value_cents", "ticket_price_cents", "value_cents"):
            value = entry.get(key)
            if isinstance(value, (int, float)) and value > 0:
                return int(value)
        for key in ("service_value", "ticket_price", "value", "price"):
            value = entry.get(key)
            if isinstance(value, (int, float)) and value > 0:
                return int(float(value) * 100)
            if isinstance(value, str):
                cleaned = re.sub(r"[^0-9.]", "", value)
                if cleaned:
                    return int(float(cleaned) * 100)
        return self._estimated_service_value_cents(self._normalize_keyword(name))

    @staticmethod
    def _service_metadata(entry: dict[str, Any]) -> dict[str, Any]:
        metadata = entry.get("metadata_json") if isinstance(entry.get("metadata_json"), dict) else {}
        return {
            **metadata,
            "description_source": entry.get("source"),
        }

    def _extract_services(self, location: Location) -> list[str]:
        if not location.settings or not location.settings.services:
            return []
        values: list[str] = []
        for entry in location.settings.services:
            if isinstance(entry, str):
                values.append(entry)
                continue
            if isinstance(entry, dict):
                label = entry.get("name") or entry.get("title") or entry.get("service")
                if isinstance(label, str):
                    values.append(label)
        return [self._clean_term(item) for item in values if self._clean_term(item)]

    def _resolve_rank(self, rank_map: dict[str, float], keyword: str) -> float | None:
        normalized = self._normalize_keyword(keyword)
        if normalized in rank_map:
            return rank_map[normalized]
        tokens = normalized.split()
        best_match: tuple[int, float] | None = None
        for known_keyword, rank in rank_map.items():
            known_tokens = known_keyword.split()
            overlap = len(set(tokens) & set(known_tokens))
            if overlap == 0:
                continue
            if best_match is None or overlap > best_match[0]:
                best_match = (overlap, rank)
        return best_match[1] if best_match else None

    def _relevance_score(self, *, keyword: str, context: DiscoveryContext, target_area: str | None) -> float:
        score = 20.0
        service_tokens = self._token_set(context.services + ([context.primary_category] if context.primary_category else []))
        keyword_tokens = self._token_set([keyword])
        overlap = len(service_tokens & keyword_tokens)
        if overlap:
            score += min(45.0, overlap * 15.0)
        if context.city and context.city.lower() in keyword:
            score += 20
        if context.state and context.state.lower() in keyword:
            score += 8
        if target_area and context.city and target_area.lower() != context.city.lower():
            score += 10
        if "near me" in keyword:
            score += 8
        return min(100.0, score)

    def _intent_score(self, keyword: str) -> float:
        score = 10.0
        lowered = keyword.lower()
        for token, value in INTENT_TOKENS.items():
            if token in lowered:
                score += value
        if "near me" in lowered:
            score += 18
        return min(100.0, score)

    def _estimated_service_value_cents(self, keyword: str) -> int:
        lowered = keyword.lower()
        base = DEFAULT_SERVICE_VALUE_CENTS
        for token, value in HIGH_TICKET_TOKENS.items():
            if token in lowered:
                base += value * 2_500
        return max(15_000, min(base, 250_000))

    def _ticket_value_score(self, keyword: str, *, service_value_cents: int | None = None) -> float:
        score = 20.0
        lowered = keyword.lower()
        for token, value in HIGH_TICKET_TOKENS.items():
            if token in lowered:
                score += value
        if service_value_cents:
            score += min(45.0, max(0.0, (service_value_cents / 100.0) / 40.0))
        return min(100.0, score)

    def _value_based_score(
        self,
        *,
        search_volume: int,
        metric: KeywordMarketMetric,
        competition: float,
        service_value_cents: int,
    ) -> tuple[float, dict[str, Any]]:
        cpc_micros = metric.average_cpc_micros
        if not cpc_micros and metric.top_of_page_bid_low_micros and metric.top_of_page_bid_high_micros:
            cpc_micros = int((metric.top_of_page_bid_low_micros + metric.top_of_page_bid_high_micros) / 2)
        cpc_dollars = max(0.10, (cpc_micros or 100_000) / 1_000_000.0)
        ticket_price = max(1.0, service_value_cents / 100.0)
        competition_divisor = max(0.15, competition)
        raw = (max(1, search_volume) * cpc_dollars * ticket_price) / competition_divisor
        score = min(100.0, math.log10(raw + 1.0) * 18.0)
        return round(score, 2), {
            "formula": "(volume * cpc * ticket_price) / competition",
            "volume": search_volume,
            "cpc": round(cpc_dollars, 4),
            "ticket_price": round(ticket_price, 2),
            "competition": round(competition_divisor, 4),
            "raw": round(raw, 4),
        }

    def _opportunity_score(self, *, current_rank: float | None, target_area: str | None, city: str | None) -> float:
        if current_rank is None:
            score = 65.0
        elif current_rank <= 3:
            score = 22.0
        elif current_rank <= 6:
            score = 56.0
        elif current_rank <= 10:
            score = 78.0
        else:
            score = 90.0
        if target_area and city and target_area.lower() != city.lower():
            score += 8
        return min(100.0, score)

    @staticmethod
    def _current_rank_score(current_rank: float | None) -> float:
        if current_rank is None:
            return 50.0
        return max(0.0, min(100.0, 100.0 - current_rank * 8.0))

    def _classifications(
        self,
        *,
        target_area: str | None,
        city: str | None,
        ticket_score: float,
        value_score: float,
        competition_score: float,
        current_rank: float | None,
        opportunity_score: float,
    ) -> list[str]:
        labels: list[str] = []
        if current_rank is not None and current_rank <= 3:
            labels.append("existing_strength")
        if target_area and city and target_area.lower() != city.lower():
            labels.append("service_area_opportunity")
            labels.append("expansion_opportunity")
        if ticket_score >= 68:
            labels.append("high_ticket_opportunity")
        if value_score >= 72:
            labels.append("value_opportunity")
        if competition_score <= 38:
            labels.append("low_competition_opportunity")
        if current_rank is not None and 4 <= current_rank <= 10:
            labels.append("move_to_top3_opportunity")
        if opportunity_score >= 80:
            labels.append("expansion_opportunity")
        if not labels:
            labels.append("core_primary_term")
        return self._dedupe_preserve(labels)

    @staticmethod
    def _selection_explanation(
        *,
        search_volume: int,
        competition_score: float,
        classifications: list[str],
        current_rank: float | None,
    ) -> str:
        if "service_area_opportunity" in classifications and competition_score <= 45:
            return "Selected because it has strong local demand and lower competition in your service area."
        if "high_ticket_opportunity" in classifications and (current_rank is None or current_rank > 4):
            return "Selected because it is a high-ticket service with room for ranking improvement."
        if "move_to_top3_opportunity" in classifications:
            return "Selected because you already have visibility and this term is likely to move into the top 3."
        if competition_score <= 35 and search_volume >= 50:
            return "Selected as a lower-competition keyword with reliable local demand."
        return "Selected for balanced relevance, intent, and measurable map-pack upside."

    @staticmethod
    def _selection_bucket(classifications: list[str]) -> str:
        if "existing_strength" in classifications:
            return "existing_strength"
        if "service_area_opportunity" in classifications:
            return "service_area_opportunity"
        if "high_ticket_opportunity" in classifications:
            return "high_ticket_opportunity"
        if "value_opportunity" in classifications:
            return "value_opportunity"
        if "low_competition_opportunity" in classifications:
            return "low_competition_opportunity"
        return "expansion_opportunity"

    @staticmethod
    def _intent_label(intent_score: float) -> str:
        if intent_score >= 75:
            return "high"
        if intent_score >= 45:
            return "medium"
        return "low"

    @staticmethod
    def _competition_label(competition_score: float) -> str:
        if competition_score <= 33:
            return "low"
        if competition_score <= 66:
            return "medium"
        return "high"

    def _profile_description_suggestion(
        self,
        *,
        location: Location,
        context: DiscoveryContext,
        top_keywords: list[str],
    ) -> str:
        primary_terms = ", ".join(top_keywords[:3])
        city = context.city or "the local area"
        if context.existing_description and len(context.existing_description) >= 180:
            return (
                f"{context.existing_description.strip()} "
                f"Customers in {city} can also contact {location.name} for {primary_terms}."
            )[:750]
        return (
            f"{location.name} provides practical local support for {primary_terms}. "
            f"Serving {city} with clear communication, timely scheduling, and reliable service."
        )

    def _service_description_payloads(
        self,
        *,
        location: Location,
        selected_keywords: list[SelectedKeyword],
        context: DiscoveryContext,
    ) -> list[dict[str, Any]]:
        by_service: dict[uuid.UUID, list[SelectedKeyword]] = defaultdict(list)
        for selected in selected_keywords:
            if selected.business_service_id:
                by_service[selected.business_service_id].append(selected)
        if not by_service:
            return []
        services = {
            row.id: row
            for row in self.db.query(BusinessService)
            .filter(BusinessService.id.in_(list(by_service)))
            .all()
        }
        payloads: list[dict[str, Any]] = []
        for service_id, keywords in by_service.items():
            service = services.get(service_id)
            if not service:
                continue
            ordered = sorted(keywords, key=lambda row: row.service_rank_order or row.rank_order)
            keyword_values = [row.keyword for row in ordered[:3]]
            primary = ordered[0]
            description = self._render_service_description(
                service_name=service.name,
                keywords=keyword_values,
                city=context.city,
                state=context.state,
                business_name=location.name,
            )
            payloads.append(
                {
                    "business_service_id": str(service.id),
                    "service_name": service.name,
                    "primary_selected_keyword_id": str(primary.id),
                    "current_description": service.description,
                    "suggested_description": description,
                    "keywords": keyword_values,
                    "template_id": "service_keyword_location_v1",
                }
            )
        return payloads

    @staticmethod
    def _render_service_description(
        *,
        service_name: str,
        keywords: list[str],
        city: str | None,
        state: str | None,
        business_name: str,
    ) -> str:
        location = ", ".join([part for part in [city, state] if part]) or "the local area"
        primary_keyword = keywords[0] if keywords else service_name
        secondary = keywords[1] if len(keywords) > 1 else service_name
        return (
            f"{business_name} provides {service_name} for customers in {location}. "
            f"Our team keeps the process clear, responsive, and focused on outcomes for {primary_keyword}. "
            f"Ask us about {secondary} when planning your next service visit."
        )

    def _should_create_profile_description_refresh(self, *, location: Location) -> bool:
        cadence_days = max(30, int(settings.PROFILE_DESCRIPTION_REFRESH_DAYS))
        cutoff = datetime.now(timezone.utc) - timedelta(days=cadence_days)
        recent = (
            self.db.query(GbpOptimizationAction)
            .filter(
                GbpOptimizationAction.organization_id == location.organization_id,
                GbpOptimizationAction.location_id == location.id,
                GbpOptimizationAction.action_type == PROFILE_DESCRIPTION_ACTION_TYPE,
                GbpOptimizationAction.created_at >= cutoff,
            )
            .first()
        )
        return recent is None

    @staticmethod
    def _service_expansion_suggestions(keywords: list[str]) -> list[str]:
        return [f"Service page variant: {keyword}" for keyword in keywords[:6]]

    @staticmethod
    def _service_description_prompts(keywords: list[str]) -> list[str]:
        return [f"Describe the process, pricing context, and trust signals for '{keyword}'." for keyword in keywords[:5]]

    @staticmethod
    def _faq_suggestions(keywords: list[str]) -> list[str]:
        prompts = []
        for keyword in keywords[:5]:
            prompts.append(f"What should customers know before booking {keyword}?")
        return prompts

    @staticmethod
    def _review_response_guidance(keywords: list[str]) -> str:
        if not keywords:
            return "Reference core services naturally and thank the customer by outcome."
        return (
            "Use natural service phrasing in replies, mention the customer outcome, "
            f"and rotate terms like {', '.join(keywords[:3])} without repetition."
        )

    @staticmethod
    def _post_theme_suggestions(keywords: list[str]) -> list[str]:
        themes = []
        for keyword in keywords:
            themes.append(f"Service spotlight for {keyword}")
        return themes[:10]

    @staticmethod
    def _image_caption_suggestions(keywords: list[str]) -> list[str]:
        return [f"Before/after highlight tied to {keyword}" for keyword in keywords[:4]]

    @staticmethod
    def _secondary_keyword_variations(keyword: str) -> list[str]:
        lowered = keyword.lower()
        variations = [
            lowered.replace(" near me", ""),
            f"best {lowered}",
            f"local {lowered}",
        ]
        clean = []
        for item in variations:
            normalized = " ".join(item.split())
            if normalized and normalized not in clean and normalized != lowered:
                clean.append(normalized)
        return clean[:3]

    @staticmethod
    def _rank_color(rank: int | None) -> tuple[str, str]:
        if rank is None:
            return "not_ranked", "#7f1d1d"
        if 1 <= rank <= 3:
            return "1-3", "#166534"
        if 4 <= rank <= 6:
            return "4-6", "#65a30d"
        if 7 <= rank <= 10:
            return "7-10", "#f59e0b"
        return "11+", "#dc2626"

    @staticmethod
    def _visibility_contribution(rank: int) -> float:
        return max(0.0, (21.0 - float(rank)) / 20.0)

    def _add_candidate(
        self,
        pool: dict[str, dict[str, Any]],
        *,
        keyword: str,
        candidate_type: str,
        source_tag: str,
        business_service: BusinessService,
        target_area: str | None = None,
    ) -> None:
        payload = self._candidate_payload(
            keyword=keyword,
            candidate_type=candidate_type,
            source_tag=source_tag,
            business_service=business_service,
            target_area=target_area,
        )
        if not payload:
            return
        normalized = payload["normalized_keyword"]
        if normalized in pool:
            tags = list(pool[normalized].get("source_tags") or [])
            if source_tag not in tags:
                tags.append(source_tag)
                pool[normalized]["source_tags"] = tags
            return
        pool[normalized] = payload

    def _candidate_payload(
        self,
        *,
        keyword: str,
        candidate_type: str,
        source_tag: str,
        business_service: BusinessService,
        target_area: str | None = None,
    ) -> dict[str, Any]:
        cleaned = self._clean_term(keyword)
        if not cleaned:
            return {}
        normalized = self._normalize_keyword(cleaned)
        cluster_key = f"{business_service.id}:{self._cluster_key(normalized)}"
        return {
            "business_service_id": business_service.id,
            "service_name": business_service.name,
            "keyword": cleaned,
            "normalized_keyword": normalized,
            "cluster_key": cluster_key,
            "target_service_area": self._clean_term(target_area) if target_area else None,
            "candidate_type": candidate_type,
            "source_tags": [source_tag],
        }

    def _resolve_scoring_weights(self, configured: Any) -> dict[str, float]:
        weights = dict(DEFAULT_SCORE_WEIGHTS)
        if isinstance(configured, dict):
            for key, value in configured.items():
                if key in weights and isinstance(value, (int, float)):
                    weights[key] = float(value)
        return weights

    @staticmethod
    def _clean_term(value: str | None) -> str:
        if value is None:
            return ""
        normalized = re.sub(r"\s+", " ", str(value)).strip()
        return normalized

    @classmethod
    def _normalize_keyword(cls, keyword: str) -> str:
        lowered = cls._clean_term(keyword).lower()
        lowered = re.sub(r"[^a-z0-9\s]", " ", lowered)
        lowered = re.sub(r"\s+", " ", lowered).strip()
        return lowered

    @classmethod
    def _cluster_key(cls, keyword: str) -> str:
        tokens = [token for token in cls._normalize_keyword(keyword).split() if token not in STOP_WORDS]
        if not tokens:
            return keyword
        key = " ".join(tokens[:3])
        digest = sha256(" ".join(tokens).encode("utf-8")).hexdigest()[:6]
        return f"{key}:{digest}"

    @staticmethod
    def _safe_str(value: Any) -> str | None:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped if stripped else None
        return None

    @classmethod
    def _listify(cls, value: Any) -> list[str]:
        items: list[str] = []
        if isinstance(value, list):
            for item in value:
                if isinstance(item, str):
                    cleaned = cls._clean_term(item)
                    if cleaned:
                        items.append(cleaned)
                elif isinstance(item, dict):
                    for key in ("name", "label", "city", "service", "placeName", "displayName"):
                        if key in item and isinstance(item[key], str):
                            cleaned = cls._clean_term(item[key])
                            if cleaned:
                                items.append(cleaned)
                                break
        elif isinstance(value, str):
            cleaned = cls._clean_term(value)
            if cleaned:
                items.append(cleaned)
        return items

    @staticmethod
    def _first_non_empty(values: Iterable[str | None]) -> str | None:
        for value in values:
            if value:
                return value
        return None

    @staticmethod
    def _token_set(values: Iterable[str | None]) -> set[str]:
        tokens: set[str] = set()
        for value in values:
            if not value:
                continue
            for token in re.split(r"\s+", value.lower()):
                cleaned = token.strip()
                if cleaned and cleaned not in STOP_WORDS:
                    tokens.add(cleaned)
        return tokens

    def _term_matches_service(self, term: str, service_name: str) -> bool:
        service_tokens = self._token_set([service_name])
        term_tokens = self._token_set([term])
        if not service_tokens or not term_tokens:
            return False
        return bool(service_tokens & term_tokens)

    @staticmethod
    def _dedupe_preserve(values: Iterable[str]) -> list[str]:
        result: list[str] = []
        seen: set[str] = set()
        for value in values:
            cleaned = str(value).strip()
            if not cleaned:
                continue
            key = cleaned.lower()
            if key in seen:
                continue
            seen.add(key)
            result.append(cleaned)
        return result


class KeywordCampaignSchedulerService:
    def __init__(self, db: Session) -> None:
        self.db = db
        from backend.app.services.automation.actions import ActionService

        self.action_service = ActionService(db)

    def schedule_monthly_campaigns(self, *, reference_date: date | None = None) -> int:
        target = reference_date or datetime.now(timezone.utc).date()
        scheduled = 0
        organizations = (
            self.db.query(Organization)
            .filter(Organization.is_active == True)  # noqa: E712
            .all()
        )
        for org in organizations:
            locations = (
                self.db.query(Location)
                .filter(Location.organization_id == org.id)
                .filter(Location.status == LocationStatus.ACTIVE)
                .all()
            )
            for location in locations:
                if not self._is_monthly_eligible(org, location):
                    continue
                dedupe_key = f"keyword-monthly-action:{org.id}:{location.id}:{target.year:04d}-{target.month:02d}"
                if self._has_action(dedupe_key):
                    continue
                self.action_service.schedule_action(
                    organization_id=org.id,
                    action_type=ActionType.RUN_KEYWORD_CAMPAIGN,
                    run_at=datetime.now(timezone.utc),
                    payload={
                        "organization_id": str(org.id),
                        "location_id": str(location.id),
                        "cycle_year": target.year,
                        "cycle_month": target.month,
                        "trigger_source": "monthly",
                        "onboarding_triggered": False,
                    },
                    location_id=location.id,
                    dedupe_key=dedupe_key,
                )
                scheduled += 1
        return scheduled

    def schedule_onboarding_first_runs(self) -> int:
        today = datetime.now(timezone.utc).date()
        scheduled = 0
        organizations = (
            self.db.query(Organization)
            .filter(Organization.is_active == True)  # noqa: E712
            .all()
        )
        for org in organizations:
            if not self._onboarding_completed(org):
                continue
            locations = (
                self.db.query(Location)
                .filter(Location.organization_id == org.id)
                .filter(Location.status == LocationStatus.ACTIVE)
                .all()
            )
            for location in locations:
                if not self._is_ready_for_first_run(org, location):
                    continue
                onboarding_already = (
                    self.db.query(KeywordCampaignCycle)
                    .filter(
                        KeywordCampaignCycle.organization_id == org.id,
                        KeywordCampaignCycle.location_id == location.id,
                        KeywordCampaignCycle.onboarding_triggered == True,  # noqa: E712
                    )
                    .count()
                )
                if onboarding_already:
                    continue
                dedupe_key = f"keyword-onboarding-action:{org.id}:{location.id}"
                if self._has_action(dedupe_key):
                    continue
                self.action_service.schedule_action(
                    organization_id=org.id,
                    action_type=ActionType.RUN_KEYWORD_CAMPAIGN,
                    run_at=datetime.now(timezone.utc),
                    payload={
                        "organization_id": str(org.id),
                        "location_id": str(location.id),
                        "cycle_year": today.year,
                        "cycle_month": today.month,
                        "trigger_source": "onboarding",
                        "onboarding_triggered": True,
                    },
                    location_id=location.id,
                    dedupe_key=dedupe_key,
                )
                scheduled += 1
        return scheduled

    def _is_monthly_eligible(self, organization: Organization, location: Location) -> bool:
        return self._onboarding_completed(organization) and self._automation_ready(organization, location)

    def _is_ready_for_first_run(self, organization: Organization, location: Location) -> bool:
        if not self._onboarding_completed(organization):
            return False
        return self._automation_ready(organization, location)

    def _automation_ready(self, organization: Organization, location: Location) -> bool:
        from backend.app.services.google_business.readiness import GbpReadinessService

        try:
            state = GbpReadinessService(self.db).calculate(
                organization_id=organization.id,
                location_id=location.id,
                persist=True,
            )
        except ValueError:
            return False
        return bool(state.get("ready"))

    def _has_core_profile_fields(self, location: Location) -> bool:
        settings_json = dict(location.settings.settings_json or {}) if location.settings else {}
        business_type = self._safe_str((location.address or {}).get("primaryCategory")) or self._safe_str(
            settings_json.get("business_type")
        )
        core_services = location.settings.services if location.settings and location.settings.services else []
        gbp_ready = bool(location.google_location_id) or bool(settings_json.get("gbp_ready") is True)
        return bool(business_type and core_services and gbp_ready)

    def _onboarding_completed(self, organization: Organization) -> bool:
        metadata = organization.metadata_json or {}
        status = str(metadata.get("onboarding_status") or metadata.get("status") or "").lower()
        if status in {"completed", "activated"}:
            return True
        onboarding = metadata.get("onboarding") if isinstance(metadata.get("onboarding"), dict) else {}
        return bool(onboarding.get("completed") is True)

    def _has_action(self, dedupe_key: str) -> bool:
        existing = (
            self.db.query(Action)
            .filter(Action.dedupe_key == dedupe_key)
            .one_or_none()
        )
        return existing is not None

    @staticmethod
    def _safe_str(value: Any) -> str | None:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped if stripped else None
        return None
