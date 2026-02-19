from __future__ import annotations

from datetime import datetime, timedelta, timezone, date
import uuid
from typing import Iterable

from sqlalchemy.orm import Session

from backend.app.models.content_plan import ContentPlan
from backend.app.models.enums import ContentPlanStatus
from backend.app.models.location import Location
from backend.app.services.post_candidates import PostCandidateService
from backend.app.services.post_composition import PostCompositionService
from backend.app.services.post_scheduler import PostSchedulerService
from backend.app.services.post_jobs import PostJobService
from backend.app.services.audit import AuditService


class ContentPlannerService:
    """Builds a rolling content plan and hydrates candidates -> posts."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.candidates = PostCandidateService(db)
        self.composer = PostCompositionService(db)
        self.scheduler = PostSchedulerService(db)
        self.audit = AuditService(db)
        self.post_jobs = PostJobService(db)

    def plan_horizon(
        self,
        *,
        organization_id: uuid.UUID,
        location: Location,
        horizon_days: int = 14,
    ) -> list[ContentPlan]:
        today = datetime.now(timezone.utc).date()
        created: list[ContentPlan] = []
        for offset in range(horizon_days):
            target = today + timedelta(days=offset)
            if self._existing_plan(location.id, target):
                continue
            candidate = self.candidates.generate(
                organization_id=organization_id,
                location_id=location.id,
                target_date=target,
            )
            if not candidate:
                continue
            plan = ContentPlan(
                organization_id=organization_id,
                location_id=location.id,
                target_date=target,
                status=ContentPlanStatus.PLANNED,
                candidate_id=candidate.id,
                reason_json=candidate.reason_json or {},
            )
            self.db.add(plan)
            self.db.commit()
            self.db.refresh(plan)
            created.append(plan)
            self.audit.log(
                action="plan.created",
                organization_id=organization_id,
                location_id=location.id,
                entity_type="content_plan",
                entity_id=str(plan.id),
                metadata={"target_date": str(target), "candidate_id": str(candidate.id)},
            )
            self._hydrate_plan(plan)
        return created

    def _existing_plan(self, location_id: uuid.UUID, target_date: date) -> ContentPlan | None:
        return (
            self.db.query(ContentPlan)
            .filter(
                ContentPlan.location_id == location_id,
                ContentPlan.target_date == target_date,
            )
            .one_or_none()
        )

    def _hydrate_plan(self, plan: ContentPlan) -> None:
        if not plan.candidate_id:
            return
        # Compose and schedule immediately to keep pipeline simple and idempotent.
        candidate = self.composer.compose(plan.candidate_id)
        plan.status = ContentPlanStatus.SELECTED
        self.db.add(plan)
        self.db.commit()
        self.db.refresh(plan)
        scheduled = self.scheduler.schedule(candidate.id)
        scheduled_time = self.scheduler._resolve_datetime(  # noqa: SLF001
            candidate.candidate_date, scheduled.window_id or "morning"
        )
        self.post_jobs.queue_from_plan(
            plan, run_at=scheduled_time, dedupe_key=f"plan:{plan.id}:{scheduled_time.isoformat()}"
        )
        plan.status = ContentPlanStatus.SCHEDULED
        plan.content_item_id = None
        self.db.add(plan)
        self.db.commit()
        self.audit.log(
            action="plan.scheduled",
            organization_id=plan.organization_id,
            location_id=plan.location_id,
            entity_type="content_plan",
            entity_id=str(plan.id),
            metadata={
                "candidate_id": str(plan.candidate_id),
                "window_id": scheduled.window_id,
            },
        )

    def existing_plans(
        self, *, organization_id: uuid.UUID, location_id: uuid.UUID, days: int = 14
    ) -> Iterable[ContentPlan]:
        horizon = datetime.now(timezone.utc).date() + timedelta(days=days)
        return (
            self.db.query(ContentPlan)
            .filter(ContentPlan.organization_id == organization_id)
            .filter(ContentPlan.location_id == location_id)
            .filter(ContentPlan.target_date <= horizon)
            .all()
        )
