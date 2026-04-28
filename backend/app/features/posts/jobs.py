from __future__ import annotations

from datetime import datetime, timezone, timedelta
import hashlib
import uuid

from sqlalchemy.orm import Session
from typing import TYPE_CHECKING

from backend.app.models.content.content_plan import ContentPlan
from backend.app.models.enums import (
    PostJobStatus,
    PostType,
    ActionType,
    AlertSeverity,
)
from backend.app.models.posts.post import Post
from backend.app.models.posts.post_job import PostJob
from backend.app.models.posts.post_attempt import PostAttempt
from backend.app.models.rank_tracking.gbp_post_keyword_mapping import GbpPostKeywordMapping
from backend.app.services.operations.audit import AuditService
from backend.app.services.posts.posts import PostService
from backend.app.services.operations.rate_limits import RateLimitError
from backend.app.services.posts.posting_safety import PostingSafetyService
from backend.app.services.google_business.gbp_publishing import GbpPublishingService
from backend.app.services.operations.alerts import AlertService

if TYPE_CHECKING:
    from backend.app.services.automation.actions import ActionService


class PostJobService:
    """Executes planned posts with idempotency, rate limits, and audit trail."""

    def __init__(self, db: Session, action_service: "ActionService | None" = None) -> None:
        self.db = db
        self.audit = AuditService(db)
        self.post_service = PostService(db, action_service=action_service)
        self.safety = PostingSafetyService(db)
        self.publisher = GbpPublishingService(db)
        if action_service is None:
            from backend.app.services.automation.actions import ActionService as ActionServiceImpl

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
        if job.status in {PostJobStatus.SUCCEEDED, PostJobStatus.SKIPPED, PostJobStatus.NEEDS_CLIENT_INPUT}:
            return {"status": job.status.value}
        if job.status == PostJobStatus.FAILED and job.attempts >= job.max_attempts:
            return {"status": "failed", "error": job.error}
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
            job.attempts += 1
            self.db.add(job)
            self.db.commit()
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
            job.status = PostJobStatus.SKIPPED if isinstance(result, dict) and result.get("skipped") else PostJobStatus.SUCCEEDED
            job.result_json = result
            attempt.status = job.status
            attempt.finished_at = datetime.now(timezone.utc)
            if job.status == PostJobStatus.SUCCEEDED:
                self._mark_mapping_status(post=post, status="published")
            self.db.add(job)
            self.db.add(attempt)
            self.db.commit()
            self.audit.log(
                action="post_job.succeeded" if job.status == PostJobStatus.SUCCEEDED else "post_job.skipped",
                organization_id=job.organization_id,
                location_id=job.location_id,
                entity_type="post_job",
                entity_id=str(job.id),
                metadata={"post_id": str(post.id)},
            )
            return {"status": job.status.value, "post_id": str(post.id)}
        except RateLimitError as exc:
            job.status = PostJobStatus.RATE_LIMITED
            job.error = "rate_limited"
            attempt.status = PostJobStatus.RATE_LIMITED
            attempt.error = "rate_limited"
            attempt.finished_at = datetime.now(timezone.utc)
            job.run_at = datetime.now(timezone.utc) + timedelta(seconds=exc.retry_after_seconds)
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
            raise
        except Exception as exc:  # noqa: BLE001
            job.error = str(exc)
            attempt.error = str(exc)
            attempt.finished_at = datetime.now(timezone.utc)
            if job.attempts >= job.max_attempts:
                job.status = PostJobStatus.FAILED
                attempt.status = PostJobStatus.FAILED
            else:
                job.status = PostJobStatus.QUEUED
                attempt.status = PostJobStatus.FAILED
            self.db.add(job)
            self.db.add(attempt)
            self.db.commit()
            if job.status == PostJobStatus.FAILED:
                return {"status": "failed", "error": str(exc)}
            raise

    def _ensure_post(self, job: PostJob) -> Post:
        plan = job.content_plan
        candidate = plan.candidate if plan and plan.candidate else None
        candidate_reason = candidate.reason_json if candidate and candidate.reason_json else {}
        existing_post_id = candidate_reason.get("post_id")
        if existing_post_id:
            existing = self.db.get(Post, uuid.UUID(str(existing_post_id)))
            if existing:
                return existing
        if candidate and candidate.fingerprint:
            existing = (
                self.db.query(Post)
                .filter(Post.organization_id == job.organization_id)
                .filter(Post.location_id == job.location_id)
                .filter(Post.fingerprint == candidate.fingerprint)
                .order_by(Post.created_at.desc())
                .first()
            )
            if existing:
                return existing
        caption = ""
        bucket = None
        media_asset_id = None
        post_type = PostType.UPDATE
        topic_tags: list[str] = []
        if plan:
            bucket = (plan.reason_json or {}).get("selected_bucket")
            caption = plan.reason_json.get("summary") if plan.reason_json else ""
            if candidate:
                bucket = candidate.bucket or bucket
                caption = candidate.proposed_caption or caption
                if candidate.media_asset_id:
                    media_asset_id = candidate.media_asset_id
            requested_type = str(candidate_reason.get("post_type") or "update").lower()
            try:
                post_type = PostType(requested_type)
            except Exception:  # noqa: BLE001
                post_type = PostType.UPDATE
            for field in ("service", "angle"):
                value = candidate_reason.get(field)
                if isinstance(value, str):
                    topic_tags.append(value)
        post = self.post_service.create_post(
            organization_id=job.organization_id,
            location_id=job.location_id,
            connected_account_id=None,
            post_type=post_type,
            base_prompt=caption or "Automated GBP update",
            scheduled_at=job.run_at or datetime.now(timezone.utc),
            context=plan.reason_json if plan else {},
            bucket=bucket,
            topic_tags=topic_tags,
            media_asset_id=media_asset_id,
            window_id=candidate.window_id if candidate else plan.window_id if plan else None,
            schedule_publish_action=False,
        )
        if candidate:
            candidate_reason["post_id"] = str(post.id)
            candidate.reason_json = candidate_reason
            self.db.add(candidate)
            self.db.commit()
        if plan and plan.candidate_id:
            self._attach_mapping_to_post(
                organization_id=job.organization_id,
                location_id=job.location_id,
                post_candidate_id=plan.candidate_id,
                post_id=post.id,
            )
        return post

    @staticmethod
    def _fingerprint(plan: ContentPlan) -> str:
        payload = f"{plan.organization_id}:{plan.location_id}:{plan.target_date}"
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]

    def _attach_mapping_to_post(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        post_candidate_id: uuid.UUID,
        post_id: uuid.UUID,
    ) -> None:
        mapping = (
            self.db.query(GbpPostKeywordMapping)
            .filter(
                GbpPostKeywordMapping.organization_id == organization_id,
                GbpPostKeywordMapping.location_id == location_id,
                GbpPostKeywordMapping.post_candidate_id == post_candidate_id,
            )
            .order_by(GbpPostKeywordMapping.created_at.desc())
            .first()
        )
        if not mapping:
            return
        mapping.post_id = post_id
        mapping.status = "scheduled"
        self.db.add(mapping)
        self.db.commit()

    def _mark_mapping_status(self, *, post: Post, status: str) -> None:
        mapping = (
            self.db.query(GbpPostKeywordMapping)
            .filter(
                GbpPostKeywordMapping.organization_id == post.organization_id,
                GbpPostKeywordMapping.location_id == post.location_id,
                GbpPostKeywordMapping.post_id == post.id,
            )
            .first()
        )
        if not mapping:
            return
        mapping.status = status
        self.db.add(mapping)
