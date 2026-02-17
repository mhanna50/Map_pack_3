from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Callable
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import settings
from ..models.action import Action
from ..models.enums import ActionStatus, ActionType, PostStatus, QnaStatus
from ..models.post import Post
from ..models.qna_entry import QnaEntry
from .audit import AuditService
from .posts import PostService
from .qna import QnaService
from .rank_tracking import RankTrackingService
from .media_management import MediaManagementService
from .competitor_monitoring import CompetitorMonitoringService
from .automation_rules import AutomationRuleService
from .gbp_publishing import GbpPublishingService
from .gbp_sync import GbpSyncService
from .daily_signals import DailySignalService
from .post_candidates import PostCandidateService
from .post_composition import PostCompositionService
from .post_scheduler import PostSchedulerService
from .post_metrics import PostMetricsService
from ..models.media_upload_request import MediaUploadRequest
from .validators import assert_location_in_org, assert_connected_account_in_org


class ActionService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.audit = AuditService(db)

    def schedule_action(
        self,
        *,
        organization_id: uuid.UUID,
        action_type: ActionType,
        run_at: datetime,
        payload: dict[str, Any] | None = None,
        location_id: uuid.UUID | None = None,
        connected_account_id: uuid.UUID | None = None,
        max_attempts: int | None = None,
        dedupe_key: str | None = None,
        priority: int = 0,
    ) -> Action:
        if location_id:
            assert_location_in_org(self.db, location_id=location_id, organization_id=organization_id)
        if connected_account_id:
            assert_connected_account_in_org(
                self.db,
                connected_account_id=connected_account_id,
                organization_id=organization_id,
            )
        scheduled_for = (
            run_at.replace(tzinfo=timezone.utc)
            if run_at.tzinfo is None
            else run_at.astimezone(timezone.utc)
        )
        action = Action(
            organization_id=organization_id,
            action_type=action_type,
            run_at=scheduled_for,
            payload=payload or {},
            location_id=location_id,
            connected_account_id=connected_account_id,
            max_attempts=max_attempts or settings.ACTION_MAX_ATTEMPTS,
            dedupe_key=dedupe_key,
            priority=priority,
        )
        self.db.add(action)
        self.db.commit()
        self.db.refresh(action)
        self.audit.log(
            action="action.scheduled",
            organization_id=organization_id,
            location_id=location_id,
            entity_type="action",
            entity_id=str(action.id),
            metadata={"action_type": action_type.value},
        )
        return action

    def fetch_due_actions(self, limit: int) -> list[Action]:
        now = datetime.now(timezone.utc)
        stmt = (
            select(Action)
            .where(Action.status == ActionStatus.PENDING)
            .where(Action.run_at <= now)
            .order_by(Action.priority.desc(), Action.run_at.asc())
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
        result = self.db.execute(stmt)
        actions = list(result.scalars().all())
        for action in actions:
            action.status = ActionStatus.QUEUED
            action.locked_at = now
        if actions:
            self.db.commit()
        return actions

    def mark_running(self, action: Action) -> None:
        action.status = ActionStatus.RUNNING
        action.attempts += 1
        action.locked_at = datetime.now(timezone.utc)
        self.db.add(action)
        self.db.commit()

    def mark_success(self, action: Action, result: dict[str, Any] | None = None) -> None:
        action.status = ActionStatus.SUCCEEDED
        action.result = result or {}
        action.error = None
        action.locked_at = None
        self.db.add(action)
        self.db.commit()
        self.audit.log(
            action="action.succeeded",
            organization_id=action.organization_id,
            location_id=action.location_id,
            entity_type="action",
            entity_id=str(action.id),
            metadata={"action_type": action.action_type.value, "result": result or {}},
        )

    def mark_failure(self, action: Action, error: str) -> None:
        now = datetime.now(timezone.utc)
        action.error = error
        if action.attempts >= action.max_attempts:
            action.status = ActionStatus.DEAD_LETTERED
            action.next_run_at = None
            action.locked_at = None
            self.audit.log(
                action="action.dead_lettered",
                organization_id=action.organization_id,
                location_id=action.location_id,
                entity_type="action",
                entity_id=str(action.id),
                metadata={"error": error},
            )
        else:
            delay = self._compute_backoff(action.attempts)
            next_run = now + timedelta(seconds=delay)
            action.status = ActionStatus.PENDING
            action.run_at = next_run
            action.next_run_at = next_run
            action.locked_at = None
            self.audit.log(
                action="action.retry_scheduled",
                organization_id=action.organization_id,
                location_id=action.location_id,
                entity_type="action",
                entity_id=str(action.id),
                metadata={"retry_in_seconds": delay, "error": error},
            )
        self.db.add(action)
        self.db.commit()

    def cancel(self, action: Action, reason: str | None = None) -> None:
        action.status = ActionStatus.CANCELLED
        action.locked_at = None
        self.db.add(action)
        self.db.commit()
        self.audit.log(
            action="action.cancelled",
            organization_id=action.organization_id,
            location_id=action.location_id,
            entity_type="action",
            entity_id=str(action.id),
            metadata={"reason": reason} if reason else None,
        )

    @staticmethod
    def _compute_backoff(attempt: int) -> int:
        base = settings.ACTION_BASE_BACKOFF_SECONDS
        backoff = base * (2 ** max(attempt - 1, 0))
        return min(backoff, settings.ACTION_MAX_BACKOFF_SECONDS)


class ActionExecutor:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.audit = AuditService(db)
        self.action_service = ActionService(db)
        self.post_service = PostService(db, self.action_service)
        self.qna_service = QnaService(db, self.action_service)
        self.rank_service = RankTrackingService(db, self.action_service)
        self.media_service = MediaManagementService(db, self.action_service)
        self.competitor_service = CompetitorMonitoringService(db, self.action_service)
        self.automation_service = AutomationRuleService(db, self.action_service)
        self.gbp_publisher = GbpPublishingService(db)
        self.gbp_sync = GbpSyncService(db)
        self.daily_signals = DailySignalService(db)
        self.post_candidates = PostCandidateService(db)
        self.post_composer = PostCompositionService(db)
        self.post_scheduler_service = PostSchedulerService(db)
        self.post_metrics = PostMetricsService(db)
        self.handlers: dict[ActionType, Callable[[Action], dict[str, Any]]] = {
            ActionType.PUBLISH_GBP_POST: self._handle_publish_post,
            ActionType.PUBLISH_QA: self._handle_publish_qna,
            ActionType.CHECK_RANKINGS: self._handle_rank_check,
            ActionType.REQUEST_MEDIA_UPLOAD: self._handle_request_media_upload,
            ActionType.MONITOR_COMPETITORS: self._handle_monitor_competitors,
            ActionType.RUN_AUTOMATION_RULES: self._handle_run_automation_rules,
            ActionType.REFRESH_GOOGLE_TOKEN: self._handle_refresh_token,
            ActionType.SYNC_GOOGLE_LOCATIONS: self._handle_sync_locations,
            ActionType.SYNC_GBP_REVIEWS: self._handle_sync_reviews,
            ActionType.SYNC_GBP_POSTS: self._handle_sync_posts,
            ActionType.COMPUTE_DAILY_SIGNALS: self._handle_compute_daily_signals,
            ActionType.GENERATE_POST_CANDIDATES: self._handle_generate_post_candidates,
            ActionType.COMPOSE_POST_CANDIDATE: self._handle_compose_post_candidate,
            ActionType.SCHEDULE_POST: self._handle_schedule_post,
            ActionType.CUSTOM: self._handle_noop,
        }

    def execute(self, action: Action) -> dict[str, Any]:
        handler = self.handlers.get(action.action_type, self._handle_noop)
        return handler(action)

    def _handle_publish_post(self, action: Action) -> dict[str, Any]:
        post_id = action.payload.get("post_id") if action.payload else None
        post: Post | None = self.db.get(Post, uuid.UUID(post_id)) if post_id else None
        if not post:
            return {"status": "missing_post"}
        try:
            self.post_service.safety.ensure_not_paused(
                organization_id=post.organization_id,
                location_id=post.location_id,
            )
        except ValueError as exc:
            self.post_service.update_post_status(post, PostStatus.CANCELLED)
            self.audit.log(
                action="post.publish_paused",
                organization_id=post.organization_id,
                location_id=post.location_id,
                entity_type="post",
                entity_id=str(post.id),
                metadata={"reason": str(exc)},
            )
            return {"status": "paused", "reason": str(exc)}
        self.post_service.update_post_status(post, PostStatus.QUEUED)
        result = self.gbp_publisher.publish_post(post)
        self.post_service.update_post_status(post, PostStatus.PUBLISHED)
        metrics = result.get("metrics") if isinstance(result, dict) else None
        self.post_metrics.record_publish_outcome(post, metrics)
        return {"status": "published", "payload": action.payload, "result": result}

    def _handle_publish_qna(self, action: Action) -> dict[str, Any]:
        qna_id = action.payload.get("qna_id") if action.payload else None
        qna: QnaEntry | None = self.db.get(QnaEntry, uuid.UUID(qna_id)) if qna_id else None
        if not qna:
            return {"status": "missing_qna"}
        qna.status = QnaStatus.PUBLISHED
        self.qna_service.mark_posted(qna)
        self.audit.log(
            action="qna.publish_requested",
            organization_id=action.organization_id,
            location_id=action.location_id,
            entity_type="qna",
            entity_id=qna_id,
            metadata={"qna_id": qna_id},
        )
        return {"status": "qna_published"}

    def _handle_rank_check(self, action: Action) -> dict[str, Any]:
        payload = action.payload or {}
        keyword_ids = payload.get("keyword_ids", [])
        grid_point_ids = payload.get("grid_point_ids", [])
        location_id = payload.get("location_id")
        if not keyword_ids or not grid_point_ids or not location_id:
            return {"status": "invalid_payload"}
        for keyword_id in keyword_ids:
            for point_id in grid_point_ids:
                self.rank_service.record_snapshot(
                    organization_id=action.organization_id,
                    location_id=uuid.UUID(location_id),
                    keyword_id=uuid.UUID(keyword_id),
                    grid_point_id=uuid.UUID(point_id),
                    rank=10,
                    in_pack=True,
                    competitor_name="Competitor Co",
                )
        return {"status": "rank_snapshots_recorded"}

    def _handle_request_media_upload(self, action: Action) -> dict[str, Any]:
        payload = action.payload or {}
        request_id = payload.get("media_upload_request_id")
        if not request_id:
            return {"status": "missing_request"}
        request: MediaUploadRequest | None = self.db.get(MediaUploadRequest, uuid.UUID(request_id))
        if not request:
            return {"status": "missing_request"}
        self.media_service.mark_request_notified(request)
        self.audit.log(
            action="media.upload_request.dispatched",
            organization_id=action.organization_id,
            location_id=action.location_id,
            entity_type="media_upload_request",
            entity_id=request_id,
            metadata={"request_id": request_id},
        )
        return {"status": "request_notified"}

    def _handle_monitor_competitors(self, action: Action) -> dict[str, Any]:
        payload = action.payload or {}
        location_id = payload.get("location_id") or (
            str(action.location_id) if action.location_id else None
        )
        if not location_id:
            return {"status": "missing_location"}
        result = self.competitor_service.run_monitoring(
            organization_id=action.organization_id,
            location_id=uuid.UUID(location_id),
        )
        self.audit.log(
            action="competitors.monitored",
            organization_id=action.organization_id,
            location_id=uuid.UUID(location_id),
            entity_type="location",
            entity_id=location_id,
            metadata=result,
        )
        return result

    def _handle_run_automation_rules(self, action: Action) -> dict[str, Any]:
        payload = action.payload or {}
        org_value = payload.get("organization_id") or str(action.organization_id)
        organization_id = uuid.UUID(org_value)
        loc_value = payload.get("location_id") or (str(action.location_id) if action.location_id else None)
        location_uuid = uuid.UUID(loc_value) if loc_value else None
        results = self.automation_service.trigger_due_rules(
            organization_id=organization_id,
            location_id=location_uuid,
        )
        self.audit.log(
            action="automation.run",
            organization_id=organization_id,
            location_id=location_uuid,
            entity_type="action",
            entity_id=str(action.id),
            metadata={"triggered": len(results)},
        )
        return {"status": "automation_run", "triggered": len(results)}

    def _handle_refresh_token(self, action: Action) -> dict[str, Any]:
        self.audit.log(
            action="gbp.token.refresh_requested",
            organization_id=action.organization_id,
            entity_type="action",
            entity_id=str(action.id),
        )
        # Token refresh is a no-op for now; the actual logic will call Google OAuth.
        return {"status": "token_refresh_stubbed"}

    def _handle_sync_locations(self, action: Action) -> dict[str, Any]:
        self.audit.log(
            action="gbp.locations.sync_requested",
            organization_id=action.organization_id,
            entity_type="action",
            entity_id=str(action.id),
        )
        return {"status": "sync_stubbed"}

    def _handle_sync_reviews(self, action: Action) -> dict[str, Any]:
        location_id = action.payload.get("location_id") if action.payload else None
        if not location_id:
            return {"status": "missing_location"}
        count = self.gbp_sync.sync_reviews(action.organization_id, uuid.UUID(location_id))
        return {"status": "reviews_synced", "count": count}

    def _handle_sync_posts(self, action: Action) -> dict[str, Any]:
        location_id = action.payload.get("location_id") if action.payload else None
        if not location_id:
            return {"status": "missing_location"}
        count = self.gbp_sync.sync_posts(action.organization_id, uuid.UUID(location_id))
        return {"status": "posts_synced", "count": count}

    def _handle_compute_daily_signals(self, action: Action) -> dict[str, Any]:
        location_id = action.payload.get("location_id") if action.payload else None
        if not location_id:
            return {"status": "missing_location"}
        target = action.payload.get("date")
        snapshot = self.daily_signals.compute(
            organization_id=action.organization_id,
            location_id=uuid.UUID(location_id),
        )
        return {"status": "signals_computed", "signal_date": snapshot.signal_date.isoformat()}

    def _handle_generate_post_candidates(self, action: Action) -> dict[str, Any]:
        location_id = action.payload.get("location_id") if action.payload else None
        if not location_id:
            return {"status": "missing_location"}
        candidate = self.post_candidates.generate(
            organization_id=action.organization_id,
            location_id=uuid.UUID(location_id),
        )
        if not candidate:
            return {"status": "no_candidate"}
        return {"status": "candidate_created", "candidate_id": str(candidate.id)}

    def _handle_compose_post_candidate(self, action: Action) -> dict[str, Any]:
        candidate_id = action.payload.get("candidate_id")
        if not candidate_id:
            return {"status": "missing_candidate"}
        candidate = self.post_composer.compose(uuid.UUID(candidate_id))
        return {"status": "candidate_composed", "candidate_id": str(candidate.id)}

    def _handle_schedule_post(self, action: Action) -> dict[str, Any]:
        candidate_id = action.payload.get("candidate_id")
        if not candidate_id:
            return {"status": "missing_candidate"}
        candidate = self.post_scheduler_service.schedule(uuid.UUID(candidate_id))
        return {"status": "post_scheduled", "candidate_id": str(candidate.id)}

    def _handle_noop(self, action: Action) -> dict[str, Any]:
        return {"status": "no-op"}
