from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
import uuid
from typing import Any, Sequence, TYPE_CHECKING

from sqlalchemy.orm import Session

from backend.app.models.enums import (
    ActionType,
    AutomationActionType,
    AutomationCondition,
    AutomationTriggerType,
    PostStatus,
    ReviewRating,
    ReviewStatus,
)
from backend.app.models.listing_audit import ListingAudit
from backend.app.models.media_asset import MediaAsset
from backend.app.models.post import Post
from backend.app.models.review import Review
from backend.app.models.automation_rule import AutomationRule
from backend.app.models.rule_simulation import RuleSimulation
from backend.app.services.audit import AuditService
from backend.app.services.validators import assert_location_in_org

if TYPE_CHECKING:
    from backend.app.services.actions import ActionService


class AutomationRuleService:
    def __init__(self, db: Session, action_service: "ActionService" | None = None) -> None:
        self.db = db
        if action_service is None:
            from backend.app.services.actions import ActionService as ActionServiceImpl

            self.action_service = ActionServiceImpl(db)
        else:
            self.action_service = action_service
        self.audit = AuditService(db)

    def validate_rule_access(self, rule: AutomationRule, user_id: uuid.UUID) -> None:
        from backend.app.services.access import AccessService

        access = AccessService(self.db)
        access.resolve_org(user_id=user_id, organization_id=rule.organization_id)

    def create_rule(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID | None,
        name: str,
        trigger_type: AutomationTriggerType,
        condition: AutomationCondition,
        action_type: AutomationActionType,
        config: dict | None = None,
        action_config: dict | None = None,
        priority: int = 0,
        weight: int = 100,
    ) -> AutomationRule:
        if location_id:
            assert_location_in_org(self.db, location_id=location_id, organization_id=organization_id)
        rule = AutomationRule(
            organization_id=organization_id,
            location_id=location_id,
            name=name,
            trigger_type=trigger_type,
            condition=condition,
            action_type=action_type,
            config=config or {},
            action_config=action_config or {},
            priority=priority,
            weight=weight,
        )
        self.db.add(rule)
        self.db.commit()
        self.db.refresh(rule)
        return rule

    def list_rules(
        self, *, organization_id: uuid.UUID, location_id: uuid.UUID | None = None
    ) -> list[AutomationRule]:
        query = self.db.query(AutomationRule).filter(AutomationRule.organization_id == organization_id)
        if location_id:
            query = query.filter(AutomationRule.location_id == location_id)
        return list(query.order_by(AutomationRule.priority.desc(), AutomationRule.weight.desc()).all())

    def get_rule(self, rule_id: uuid.UUID) -> AutomationRule | None:
        return self.db.get(AutomationRule, rule_id)

    def update_rule(self, rule: AutomationRule, **updates: Any) -> AutomationRule:
        for key, value in updates.items():
            if hasattr(rule, key) and value is not None:
                setattr(rule, key, value)
        self.db.add(rule)
        self.db.commit()
        self.db.refresh(rule)
        return rule

    def set_enabled(self, rule: AutomationRule, enabled: bool) -> AutomationRule:
        rule.enabled = enabled
        self.db.add(rule)
        self.db.commit()
        self.db.refresh(rule)
        return rule

    def delete_rule(self, rule: AutomationRule) -> None:
        self.db.delete(rule)
        self.db.commit()

    def simulate(self, rule: AutomationRule, *, days: int = 30) -> RuleSimulation:
        since = datetime.now(timezone.utc) - timedelta(days=days)
        metrics = self._evaluate(rule, since=since, preview=True)
        simulation = RuleSimulation(
            rule_id=rule.id,
            summary=f"Would trigger {metrics['would_trigger']} actions",
            metrics=metrics,
            triggered_actions=metrics["would_trigger"],
            sample_payload=metrics.get("sample_payload"),
        )
        rule.last_simulated_at = datetime.now(timezone.utc)
        self.db.add(simulation)
        self.db.add(rule)
        self.db.commit()
        self.db.refresh(simulation)
        return simulation

    def evaluate_rules(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID | None = None,
    ) -> list[AutomationRule]:
        rules = self.list_rules(organization_id=organization_id, location_id=location_id)
        buckets: dict[str, list[AutomationRule]] = defaultdict(list)
        for rule in rules:
            if not rule.enabled:
                continue
            bucket = str(rule.location_id or "global")
            buckets[bucket].append(rule)
        winners: list[AutomationRule] = []
        for bucket_rules in buckets.values():
            winners.extend(self._resolve_conflicts(bucket_rules))
        return winners

    def trigger_due_rules(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID | None = None,
    ) -> list[dict[str, Any]]:
        rules = self.evaluate_rules(organization_id=organization_id, location_id=location_id)
        results: list[dict[str, Any]] = []
        for rule in rules:
            metrics = self._evaluate(rule)
            if metrics["should_trigger"]:
                action = self._execute(rule, metrics)
                results.append({"rule_id": str(rule.id), "action_id": str(action.id)})
        return results

    def _resolve_conflicts(self, rules: Sequence[AutomationRule]) -> list[AutomationRule]:
        ordered = sorted(rules, key=lambda r: (r.priority, r.weight), reverse=True)
        chosen: list[AutomationRule] = []
        seen = set()
        for rule in ordered:
            scope = rule.location_id or "global"
            if scope in seen and rule.priority < chosen[0].priority if chosen else False:
                continue
            seen.add(scope)
            chosen.append(rule)
        return chosen

    def _evaluate(
        self,
        rule: AutomationRule,
        since: datetime | None = None,
        until: datetime | None = None,
        preview: bool = False,
    ) -> dict[str, Any]:
        handler = self._handler(rule.trigger_type)
        return handler(rule, since=since, until=until, preview=preview)

    def _handler(self, trigger: AutomationTriggerType):
        return {
            AutomationTriggerType.INACTIVITY: self._check_inactivity,
            AutomationTriggerType.RANK_DROP: self._check_rank_change,
            AutomationTriggerType.NEGATIVE_REVIEW: self._check_negative_review,
            AutomationTriggerType.MISSING_SERVICE: self._check_missing_services,
            AutomationTriggerType.PHOTO_STALENESS: self._check_photo_freshness,
        }[trigger]

    def _check_inactivity(self, rule: AutomationRule, **_: Any) -> dict[str, Any]:
        days = int(rule.config.get("days", 7)) if rule.config else 7
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        has_recent = (
            self.db.query(Post)
            .filter(Post.location_id == rule.location_id)
            .filter(Post.status.in_([PostStatus.SCHEDULED, PostStatus.PUBLISHED]))
            .filter(Post.scheduled_at >= cutoff)
            .first()
            is not None
        )
        should_trigger = not has_recent
        context = {"reason": f"No posts since {cutoff.date()}"}
        return self._response(should_trigger, context)

    def _check_rank_change(self, rule: AutomationRule, **_: Any) -> dict[str, Any]:
        drop = int(rule.config.get("drop_points", 5)) if rule.config else 5
        context = {"reason": f"Rank dropped by {drop} points"}
        should_trigger = drop > 0
        return self._response(should_trigger, context)

    def _check_negative_review(self, rule: AutomationRule, **_: Any) -> dict[str, Any]:
        threshold = rule.config.get("max_rating") if rule.config else ReviewRating.THREE.value
        latest = (
            self.db.query(Review)
            .filter(Review.location_id == rule.location_id)
            .filter(Review.status == ReviewStatus.NEW)
            .order_by(Review.created_at.desc())
            .first()
        )
        should_trigger = latest is not None and latest.rating.value <= threshold
        context = {"review_id": str(latest.id) if latest else None}
        return self._response(should_trigger, context)

    def _check_missing_services(self, rule: AutomationRule, **_: Any) -> dict[str, Any]:
        audit = (
            self.db.query(ListingAudit)
            .filter(ListingAudit.location_id == rule.location_id)
            .order_by(ListingAudit.created_at.desc())
            .first()
        )
        missing = audit.metadata_json.get("missing_services") if audit and audit.metadata_json else None
        return self._response(bool(missing), {"missing": missing})

    def _check_photo_freshness(self, rule: AutomationRule, **_: Any) -> dict[str, Any]:
        days = int(rule.config.get("days", 14)) if rule.config else 14
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        latest = (
            self.db.query(MediaAsset)
            .filter(MediaAsset.location_id == rule.location_id)
            .order_by(MediaAsset.created_at.desc())
            .first()
        )
        stale = not latest or not latest.created_at or latest.created_at < cutoff
        context = {"last_media": latest.created_at.isoformat() if latest and latest.created_at else None}
        return self._response(stale, context)

    def _execute(self, rule: AutomationRule, metrics: dict[str, Any]):
        action = self.action_service.schedule_action(
            organization_id=rule.organization_id,
            action_type=self._map_action(rule.action_type),
            run_at=datetime.now(timezone.utc),
            payload={"rule_id": str(rule.id), "context": metrics.get("context")},
            location_id=rule.location_id,
            priority=rule.priority,
        )
        self.audit.log(
            action="automation.rule.executed",
            organization_id=rule.organization_id,
            location_id=rule.location_id,
            entity_type="automation_rule",
            entity_id=str(rule.id),
            metadata={"rule_id": str(rule.id), "metrics": metrics},
        )
        return action

    def _map_action(self, action: AutomationActionType) -> ActionType:
        return {
            AutomationActionType.CREATE_POST: ActionType.PUBLISH_GBP_POST,
            AutomationActionType.REQUEST_PHOTOS: ActionType.REQUEST_MEDIA_UPLOAD,
            AutomationActionType.ACCEPT_REVIEW_REPLY: ActionType.CUSTOM,
        }.get(action, ActionType.CUSTOM)

    def _response(self, should_trigger: bool, context: dict[str, Any]) -> dict[str, Any]:
        return {
            "should_trigger": should_trigger,
            "would_trigger": 1 if should_trigger else 0,
            "sample_payload": context,
            "context": context,
        }
