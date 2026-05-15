from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Sequence

from backend.app.core.config import settings
from backend.app.features.rank_tracking.providers import (
    GoogleAdsKeywordDataProvider,
    HeuristicKeywordDataProvider,
    KeywordMarketMetric,
)
from backend.app.models.automation.action import Action
from backend.app.models.enums import ActionType, LocationStatus, MembershipRole, OrganizationType
from backend.app.models.google_business.business_service import BusinessService
from backend.app.models.google_business.listing_audit import ListingAudit
from backend.app.models.google_business.location import Location
from backend.app.models.google_business.location_settings import LocationSettings
from backend.app.models.identity.membership import Membership
from backend.app.models.identity.organization import Organization
from backend.app.models.identity.user import User
from backend.app.models.rank_tracking.gbp_optimization_action import GbpOptimizationAction
from backend.app.models.rank_tracking.geo_grid_scan import GeoGridScan
from backend.app.models.rank_tracking.gbp_post_keyword_mapping import GbpPostKeywordMapping
from backend.app.models.rank_tracking.keyword_candidate import KeywordCandidate
from backend.app.models.rank_tracking.keyword_score import KeywordScore
from backend.app.models.rank_tracking.selected_keyword import SelectedKeyword
from backend.app.services.rank_tracking.keyword_strategy import KeywordCampaignService, KeywordCampaignSchedulerService


class PlannerStubProvider:
    provider_name = "google_ads_keyword_planner"

    def __init__(self) -> None:
        self.calls: list[dict] = []

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
        self.calls.append(
            {
                "service_name": service_name,
                "seed_keywords": list(seed_keywords),
                "page_url": page_url,
                "location_id": str(location.id),
            }
        )
        city = (location.address or {}).get("city") or "Austin"
        ideas = [
            f"{service_name} {city}",
            f"emergency {service_name} {city}",
            f"{service_name} near me",
            f"{service_name} cost",
            f"best {service_name} company",
            *list(seed_keywords),
        ]
        deduped = list(dict.fromkeys(keyword for keyword in ideas if keyword))
        metrics: dict[str, KeywordMarketMetric] = {}
        for idx, keyword in enumerate(deduped[:max_results]):
            volume = max(30, 620 - idx * 21)
            competition_index = float(min(92, 28 + idx * 3))
            cpc_micros = 1_400_000 + idx * 90_000
            metrics[keyword] = KeywordMarketMetric(
                search_volume=volume,
                avg_monthly_searches=volume,
                average_cpc_micros=cpc_micros,
                top_of_page_bid_low_micros=int(cpc_micros * 0.65),
                top_of_page_bid_high_micros=int(cpc_micros * 1.85),
                competition=competition_index / 100.0,
                competition_index=competition_index,
                competition_level="low" if competition_index <= 33 else "medium",
                provider=self.provider_name,
                source_query={
                    "api": "KeywordPlanIdeaService.GenerateKeywordIdeas",
                    "service_name": service_name,
                    "business_location": city,
                    "page_url": page_url,
                },
            )
        return metrics


class FakeKeywordIdeaService:
    def __init__(self) -> None:
        self.requests = []

    def generate_keyword_ideas(self, *, request):
        self.requests.append(request)
        metrics = SimpleNamespace(
            avg_monthly_searches=120,
            competition=SimpleNamespace(name="LOW"),
            competition_index=22,
            average_cpc_micros=900_000,
            low_top_of_page_bid_micros=500_000,
            high_top_of_page_bid_micros=1_400_000,
        )
        return [SimpleNamespace(text="ac repair austin", keyword_idea_metrics=metrics)]


class FakeGoogleAdsService:
    @staticmethod
    def language_constant_path(language_id: str) -> str:
        return f"languageConstants/{language_id}"


class FakeGeoTargetConstantService:
    @staticmethod
    def geo_target_constant_path(geo_target_id: str) -> str:
        return f"geoTargetConstants/{geo_target_id}"


class FakeGoogleAdsClient:
    def __init__(self) -> None:
        self.idea_service = FakeKeywordIdeaService()
        self.enums = SimpleNamespace(
            KeywordPlanNetworkEnum=SimpleNamespace(GOOGLE_SEARCH_AND_PARTNERS="GOOGLE_SEARCH_AND_PARTNERS")
        )

    def get_service(self, name: str):
        if name == "KeywordPlanIdeaService":
            return self.idea_service
        if name == "GoogleAdsService":
            return FakeGoogleAdsService()
        if name == "GeoTargetConstantService":
            return FakeGeoTargetConstantService()
        raise AssertionError(f"Unexpected Google Ads service requested: {name}")

    @staticmethod
    def get_type(name: str):
        if name != "GenerateKeywordIdeasRequest":
            raise AssertionError(f"Unexpected Google Ads request type requested: {name}")
        return SimpleNamespace(
            customer_id="",
            language="",
            include_adult_keywords=None,
            keyword_plan_network=None,
            geo_target_constants=[],
            keyword_seed=SimpleNamespace(keywords=[]),
            keyword_and_url_seed=SimpleNamespace(url="", keywords=[]),
            url_seed=SimpleNamespace(url=""),
        )


def _seed_location(db_session):
    user = User(email="keyword-strategy@example.com")
    db_session.add(user)
    org = Organization(
        name="Keyword Strategy Org",
        org_type=OrganizationType.AGENCY,
        metadata_json={"onboarding_status": "completed"},
    )
    db_session.add(org)
    db_session.flush()
    membership = Membership(user_id=user.id, organization_id=org.id, role=MembershipRole.OWNER)
    db_session.add(membership)
    location = Location(
        organization_id=org.id,
        name="Downtown HVAC",
        timezone="UTC",
        status=LocationStatus.ACTIVE,
        google_location_id="accounts/123/locations/456",
        address={
            "city": "Austin",
            "state": "TX",
            "primaryCategory": "HVAC contractor",
        },
        latitude=30.2672,
        longitude=-97.7431,
    )
    db_session.add(location)
    db_session.flush()
    settings = LocationSettings(
        location_id=location.id,
        services=[
            {
                "name": "ac repair",
                "description": "Cooling repair and diagnostic calls.",
                "ticket_price_cents": 45000,
            },
            {
                "name": "furnace replacement",
                "description": "Replacement estimates and installs.",
                "ticket_price_cents": 650000,
            },
            {
                "name": "air duct cleaning",
                "description": "Whole-home duct cleaning.",
                "ticket_price_cents": 70000,
            },
        ],
        settings_json={
            "service_area_cities": ["Round Rock", "Cedar Park"],
            "gbp_description": "Local HVAC team with same-day service.",
            "website_url": "https://example.com",
            "gbp_ready": True,
        },
    )
    db_session.add(settings)
    db_session.add(
        ListingAudit(
            organization_id=org.id,
            location_id=location.id,
            category="HVAC contractor",
            audited_at=datetime.now(timezone.utc),
            status="completed",
            completed_at=datetime.now(timezone.utc),
            profile_completeness_score=100,
            trigger_source="test",
            summary_json={},
        )
    )
    db_session.commit()
    return org, location


def _clear_google_ads_settings(monkeypatch):
    for field_name in GoogleAdsKeywordDataProvider.required_settings:
        monkeypatch.setattr(settings, field_name, "")
    monkeypatch.setattr(settings, "GOOGLE_ADS_LOGIN_CUSTOMER_ID", "")
    monkeypatch.setattr(settings, "GOOGLE_ADS_GEO_TARGET_IDS", "")


def test_google_ads_keyword_planner_uses_env_agency_customer_id(monkeypatch, db_session, caplog):
    org, location = _seed_location(db_session)
    location.external_ids = {
        "google_ads_customer_id": "999-999-9999",
        "google_ads_geo_target_ids": ["1026201"],
    }
    db_session.add(location)
    db_session.commit()
    monkeypatch.setattr(settings, "GOOGLE_ADS_DEVELOPER_TOKEN", "dev-token")
    monkeypatch.setattr(settings, "GOOGLE_ADS_CLIENT_ID", "client-id")
    monkeypatch.setattr(settings, "GOOGLE_ADS_CLIENT_SECRET", "client-secret")
    monkeypatch.setattr(settings, "GOOGLE_ADS_REFRESH_TOKEN", "refresh-token")
    monkeypatch.setattr(settings, "GOOGLE_ADS_CUSTOMER_ID", "123-456-7890")
    monkeypatch.setattr(settings, "GOOGLE_ADS_LOGIN_CUSTOMER_ID", "222-333-4444")

    fake_client = FakeGoogleAdsClient()
    provider = GoogleAdsKeywordDataProvider(client=fake_client)
    with caplog.at_level("INFO"):
        metrics = provider.fetch_service_keyword_ideas(
            location=location,
            service_name="ac repair",
            seed_keywords=["hvac repair"],
        )

    request = fake_client.idea_service.requests[0]
    assert request.customer_id == "1234567890"
    assert request.customer_id != location.external_ids["google_ads_customer_id"].replace("-", "")
    assert metrics["ac repair austin"].source_query["google_ads_account_scope"] == "agency_owned_global"
    assert "customer_id" not in metrics["ac repair austin"].source_query
    assert any(
        "using configured agency Google Ads account, not a client account" in record.message
        for record in caplog.records
    )
    assert org.id == location.organization_id


def test_default_keyword_provider_falls_back_when_google_ads_not_required(monkeypatch):
    _clear_google_ads_settings(monkeypatch)
    monkeypatch.setattr(settings, "REQUIRE_GOOGLE_KEYWORD_PLANNER", False)

    provider = KeywordCampaignService._default_keyword_data_provider()

    assert isinstance(provider, HeuristicKeywordDataProvider)


def test_missing_google_ads_credentials_only_block_when_required(monkeypatch):
    _clear_google_ads_settings(monkeypatch)
    monkeypatch.setattr(settings, "GOOGLE_ADS_DEVELOPER_TOKEN", "dev-token")
    monkeypatch.setattr(settings, "REQUIRE_GOOGLE_KEYWORD_PLANNER", True)

    try:
        KeywordCampaignService._default_keyword_data_provider()
    except ValueError as exc:
        assert "Google Ads Keyword Planner is required" in str(exc)
    else:
        raise AssertionError("Expected missing Google Ads credentials to block required Keyword Planner")


def test_keyword_campaign_cycle_generates_full_pipeline(db_session):
    org, location = _seed_location(db_session)
    provider = PlannerStubProvider()
    service = KeywordCampaignService(db_session, keyword_data_provider=provider)

    cycle = service.run_cycle(
        organization_id=org.id,
        location_id=location.id,
        cycle_year=2026,
        cycle_month=4,
        trigger_source="manual",
    )

    assert cycle.status == "completed"
    assert cycle.data_sources_json["keyword_provider"] == "google_ads_keyword_planner"
    assert {call["service_name"] for call in provider.calls} == {
        "ac repair",
        "furnace replacement",
        "air duct cleaning",
    }

    services = (
        db_session.query(BusinessService)
        .filter(BusinessService.location_id == location.id, BusinessService.is_active == True)  # noqa: E712
        .all()
    )
    assert len(services) == 3
    assert all(service_row.service_value_cents and service_row.service_value_cents > 0 for service_row in services)

    selected = (
        db_session.query(SelectedKeyword)
        .filter(SelectedKeyword.campaign_cycle_id == cycle.id)
        .order_by(SelectedKeyword.rank_order.asc())
        .all()
    )
    assert len(selected) == 9
    assert [row.rank_order for row in selected] == list(range(1, 10))
    assert all(row.business_service_id for row in selected)
    assert all(row.status == "active" and row.is_active for row in selected)
    assert all(row.search_volume and row.average_cpc_micros for row in selected)
    assert all(row.top_of_page_bid_low_micros and row.top_of_page_bid_high_micros for row in selected)
    assert all(row.competition_index is not None for row in selected)
    assert all(row.service_value_cents and row.service_value_cents > 0 for row in selected)
    per_service_counts = Counter(row.business_service_id for row in selected)
    assert set(per_service_counts.values()) == {3}
    assert all(
        sum(1 for row in selected if row.business_service_id == service_row.id and row.is_primary) == 1
        for service_row in services
    )

    candidates = db_session.query(KeywordCandidate).filter(KeywordCandidate.campaign_cycle_id == cycle.id).all()
    scores = db_session.query(KeywordScore).filter(KeywordScore.campaign_cycle_id == cycle.id).all()
    assert candidates
    assert scores
    assert all(candidate.business_service_id for candidate in candidates)
    assert all(candidate.provider == "google_ads_keyword_planner" for candidate in candidates)
    assert all(score.business_service_id for score in scores)
    assert all(score.value_score is not None and score.value_score > 0 for score in scores)
    assert all(score.score_formula_json.get("formula") == "(volume * cpc * ticket_price) / competition" for score in scores)

    scans = (
        db_session.query(GeoGridScan)
        .filter(GeoGridScan.campaign_cycle_id == cycle.id, GeoGridScan.scan_type == "baseline")
        .all()
    )
    assert len(scans) == 9
    assert all(scan.total_points > 0 for scan in scans)

    mappings = (
        db_session.query(GbpPostKeywordMapping)
        .filter(GbpPostKeywordMapping.campaign_cycle_id == cycle.id)
        .all()
    )
    assert len(mappings) == settings.KEYWORD_POSTS_PER_MONTH
    assert all(mapping.target_keyword for mapping in mappings)
    assert all(mapping.selected_keyword_id for mapping in mappings)
    assert all(mapping.business_service_id for mapping in mappings)
    assert all(mapping.service_name for mapping in mappings)
    assert all(mapping.status == "planned" for mapping in mappings)

    profile_actions = (
        db_session.query(GbpOptimizationAction)
        .filter(GbpOptimizationAction.campaign_cycle_id == cycle.id, GbpOptimizationAction.action_type == "description_refresh")
        .all()
    )
    service_actions = (
        db_session.query(GbpOptimizationAction)
        .filter(GbpOptimizationAction.campaign_cycle_id == cycle.id, GbpOptimizationAction.action_type == "service_description_update")
        .all()
    )
    assert len(profile_actions) == 1
    assert profile_actions[0].status == "pending_review"
    assert profile_actions[0].auto_apply_allowed is False
    assert len(service_actions) == 3
    assert all(action.selected_keyword_id for action in service_actions)
    assert all(action.after_value["template_id"] == "service_keyword_location_v1" for action in service_actions)
    assert all(action.after_value["keywords"] for action in service_actions)

    followup_action = (
        db_session.query(Action)
        .filter(
            Action.organization_id == org.id,
            Action.location_id == location.id,
            Action.action_type == ActionType.RUN_KEYWORD_FOLLOWUP_SCAN,
        )
        .first()
    )
    assert followup_action is not None

    payload = service.build_dashboard_payload(organization_id=org.id, location_id=location.id, cycle_id=cycle.id)
    assert payload["has_data"] is True
    assert len(payload["keywords"]) == 9
    assert all(item["business_service_id"] for item in payload["keywords"])
    assert len(payload["post_plan"]) == settings.KEYWORD_POSTS_PER_MONTH
    assert payload["geo_grid"]


def test_monthly_cycle_retains_only_strong_service_keywords(db_session):
    org, location = _seed_location(db_session)
    provider = PlannerStubProvider()
    service = KeywordCampaignService(db_session, keyword_data_provider=provider)

    first_cycle = service.run_cycle(
        organization_id=org.id,
        location_id=location.id,
        cycle_year=2026,
        cycle_month=4,
        trigger_source="manual",
    )
    first_selected = (
        db_session.query(SelectedKeyword)
        .filter(SelectedKeyword.campaign_cycle_id == first_cycle.id)
        .order_by(SelectedKeyword.rank_order.asc())
        .all()
    )
    retained_previous = first_selected[0]
    replaced_previous = first_selected[-1]
    for row in first_selected:
        row.performance_json = {"performance_score": 20}
        db_session.add(row)
    retained_previous.performance_json = {"performance_score": 95}
    db_session.add(retained_previous)
    db_session.commit()

    second_cycle = service.run_cycle(
        organization_id=org.id,
        location_id=location.id,
        cycle_year=2026,
        cycle_month=5,
        trigger_source="monthly",
    )

    retained_current = (
        db_session.query(SelectedKeyword)
        .filter(
            SelectedKeyword.campaign_cycle_id == second_cycle.id,
            SelectedKeyword.previous_selected_keyword_id == retained_previous.id,
        )
        .one()
    )
    db_session.refresh(retained_previous)
    db_session.refresh(replaced_previous)
    assert retained_current.keyword == retained_previous.keyword
    assert retained_current.status == "active"
    assert retained_current.is_active is True
    assert retained_previous.status == "retained"
    assert retained_previous.is_active is False
    assert replaced_previous.status == "replaced"
    assert replaced_previous.is_active is False

    active_keywords = (
        db_session.query(SelectedKeyword)
        .filter(SelectedKeyword.location_id == location.id, SelectedKeyword.status == "active", SelectedKeyword.is_active == True)  # noqa: E712
        .all()
    )
    assert len(active_keywords) == 9
    assert all(row.campaign_cycle_id == second_cycle.id for row in active_keywords)

    second_profile_actions = (
        db_session.query(GbpOptimizationAction)
        .filter(GbpOptimizationAction.campaign_cycle_id == second_cycle.id, GbpOptimizationAction.action_type == "description_refresh")
        .all()
    )
    second_service_actions = (
        db_session.query(GbpOptimizationAction)
        .filter(GbpOptimizationAction.campaign_cycle_id == second_cycle.id, GbpOptimizationAction.action_type == "service_description_update")
        .all()
    )
    assert second_profile_actions == []
    assert len(second_service_actions) == 3


def test_onboarding_scheduler_is_one_time(db_session):
    org, location = _seed_location(db_session)
    scheduler = KeywordCampaignSchedulerService(db_session)

    first = scheduler.schedule_onboarding_first_runs()
    second = scheduler.schedule_onboarding_first_runs()

    assert first == 1
    assert second == 0
    queued = (
        db_session.query(Action)
        .filter(
            Action.organization_id == org.id,
            Action.location_id == location.id,
            Action.action_type == ActionType.RUN_KEYWORD_CAMPAIGN,
        )
        .all()
    )
    assert len(queued) == 1
