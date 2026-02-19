from __future__ import annotations

from datetime import datetime, timezone, timedelta
import hashlib
import uuid

from sqlalchemy.orm import Session
from typing import TYPE_CHECKING

from backend.app.models.content_plan import ContentPlan
from backend.app.models.enums import (
    ContentPlanStatus,
    PostJobStatus,
    PostStatus,
    PostType,
    ActionType,
    AlertSeverity,
)
from backend.app.models.post import Post
from backend.app.models.post_job import PostJob
from backend.app.models.post_attempt import PostAttempt
from backend.app.services.audit import AuditService
from backend.app.services.posts import PostService
from backend.app.services.rate_limits import RateLimitError, RateLimitService
from backend.app.services.posting_safety import PostingSafetyService
from backend.app.services.gbp_publishing import GbpPublishingService
from backend.app.services.alerts import AlertService

if TYPE_CHECKING:
    from backend.app.services.actions import ActionService


class PostJobService:
    """Executes planned posts with idempotency, rate limits, and audit trail."""

    def __init__(self, db: Session, action_service: "ActionService | None" = None) -> None:
        self.db = db
        self.audit = AuditService(db)
        self.rate_limits = RateLimitService(db)
        self.post_service = PostService(db, action_service=action_service)
        self.safety = PostingSafetyService(db)
        self.publisher = GbpPublishingService(db)
        if action_service is None:
            from backend.app.services.actions import ActionService as ActionServiceImpl

            self.action_service = ActionServiceImpl(db)
        else:
            self.action_service = action_service
        self.alerts = AlertService(db)

    def queue_from_plan(self, plan: ContentPlan, *, run_at: datetime, dedupe_key: str | None = None) -> PostJob:
        dedupe = dedupe_key or self._fingerprint(plan)
        existing = (
            self.db.query(PostJob)
            .filter(PostJob.dedupe_key == dedupe)
            .one_or_none()
        )
        if existing:
            return existing
        job = PostJob(
            organization_id=plan.organization_id,
            location_id=plan.location_id,
            content_plan_id=plan.id,
            dedupe_key=dedupe,
            status=PostJobStatus.QUEUED,
            run_at=run_at,
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        # schedule executor action for the run_at slot
        self.action_service.schedule_action(
            organization_id=plan.organization_id,
            action_type=ActionType.EXECUTE_POST_JOB,
            run_at=run_at,
            payload={"post_job_id": str(job.id)},
            location_id=plan.location_id,
            dedupe_key=f"postjob:{job.id}",
        )
        self.audit.log(
            action="post_job.queued",
            organization_id=plan.organization_id,
            location_id=plan.location_id,
            entity_type="post_job",
            entity_id=str(job.id),
            metadata={"plan_id": str(plan.id), "dedupe_key": dedupe},
        )
        return job

    def execute(self, job_id: uuid.UUID) -> dict:
        job = self.db.get(PostJob, job_id)
        if not job:
            return {"status": "missing_job"}
        attempt = PostAttempt(
            post_job_id=job.id,
            status=PostJobStatus.RUNNING,
            started_at=datetime.now(timezone.utc),
        )
        self.db.add(attempt)
        self.db.commit()
        try:
            job.status = PostJobStatus.RUNNING
            job.locked_at = datetime.now(timezone.utc)
            self.db.add(job)
            self.db.commit()
            self.rate_limits.check_and_increment(
                organization_id=job.organization_id,
                location_id=job.location_id,
            )
            # safety: ensure org/location not paused
            self.safety.ensure_not_paused(
                organization_id=job.organization_id,
                location_id=job.location_id,
            )
            post = self._ensure_post(job)
            if job.content_plan and not post.media_asset_id and (job.content_plan.reason_json or {}).get("selected_bucket") in {"proof", "service_spotlight", "local_highlight"}:
                job.status = PostJobStatus.NEEDS_CLIENT_INPUT
                job.error = "photo_required"
                attempt.status = PostJobStatus.NEEDS_CLIENT_INPUT
                attempt.error = "photo_required"
                self.db.add(job)
                self.db.add(attempt)
                self.db.commit()
                self.alerts.create_alert(
                    severity=AlertSeverity.INFO,
                    alert_type="photo_needed",
                    message="Photo required for upcoming GBP post",
                    organization_id=job.organization_id,
                    location_id=job.location_id,
                )
                self.audit.log(
                    action="post_job.needs_photo",
                    organization_id=job.organization_id,
                    location_id=job.location_id,
                    entity_type="post_job",
                    entity_id=str(job.id),
                    metadata={"reason": "photo_required"},
                )
                return {"status": "needs_client_input", "reason": "photo_required"}
            result = self.publisher.publish_post(post)
            job.status = PostJobStatus.SUCCEEDED
            job.result_json = result
            attempt.status = PostJobStatus.SUCCEEDED
            attempt.finished_at = datetime.now(timezone.utc)
            self.db.add(job)
            self.db.add(attempt)
            self.db.commit()
            self.audit.log(
                action="post_job.succeeded",
                organization_id=job.organization_id,
                location_id=job.location_id,
                entity_type="post_job",
                entity_id=str(job.id),
                metadata={"post_id": str(post.id)},
            )
            return {"status": "succeeded", "post_id": str(post.id)}
        except RateLimitError as exc:
            job.status = PostJobStatus.RATE_LIMITED
            job.error = "rate_limited"
            attempt.status = PostJobStatus.RATE_LIMITED
            attempt.error = "rate_limited"
            job.run_at = datetime.now(timezone.utc) + timedelta(minutes=5)
            self.db.add(job)
            self.db.add(attempt)
            self.db.commit()
            self.alerts.create_alert(
                severity=AlertSeverity.WARNING,
                alert_type="rate_limited",
                message="GBP posting paused due to rate limit",
                organization_id=job.organization_id,
                location_id=job.location_id,
            )
            return {"status": "rate_limited", "retry_after": exc.retry_after_seconds}
        except Exception as exc:  # noqa: BLE001
            job.status = PostJobStatus.FAILED
            job.error = str(exc)
            attempt.status = PostJobStatus.FAILED
            attempt.error = str(exc)
            attempt.finished_at = datetime.now(timezone.utc)
            self.db.add(job)
            self.db.add(attempt)
            self.db.commit()
            return {"status": "failed", "error": str(exc)}

    def _ensure_post(self, job: PostJob) -> Post:
        # idempotency: reuse existing published/queued post by dedupe key
        existing = (
            self.db.query(Post)
            .filter(Post.organization_id == job.organization_id)
            .filter(Post.location_id == job.location_id)
            .filter(Post.bucket == (job.content_plan.reason_json or {}).get("selected_bucket"))
            .order_by(Post.created_at.desc())
            .first()
        )
        if existing and existing.status == PostStatus.PUBLISHED:
            job.status = PostJobStatus.SKIPPED
            self.db.add(job)
            self.db.commit()
            return existing
        plan = job.content_plan
        caption = ""
        bucket = None
        media_asset_id = None
        if plan:
            bucket = (plan.reason_json or {}).get("selected_bucket")
            caption = plan.reason_json.get("summary") if plan.reason_json else ""
            if plan.candidate and plan.candidate.media_asset_id:
                media_asset_id = plan.candidate.media_asset_id
        post = self.post_service.create_post(
            organization_id=job.organization_id,
            location_id=job.location_id,
            connected_account_id=None,
            post_type=PostType.UPDATE,
            base_prompt=caption or "Automated GBP update",
            scheduled_at=datetime.now(timezone.utc),
            context=plan.reason_json if plan else {},
            bucket=bucket,
            topic_tags=[],
            media_asset_id=media_asset_id,
        )
        return post

    @staticmethod
    def _fingerprint(plan: ContentPlan) -> str:
        payload = f"{plan.organization_id}:{plan.location_id}:{plan.target_date}"
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]
