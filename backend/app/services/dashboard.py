from __future__ import annotations

from datetime import datetime, timedelta, timezone
from statistics import mean
import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.app.models.action import Action
from backend.app.models.approval_request import ApprovalRequest
from backend.app.models.dashboard_snapshot import DashboardSnapshot
from backend.app.models.enums import ActionStatus, ApprovalStatus, PostStatus
from backend.app.models.location import Location
from backend.app.models.membership import Membership
from backend.app.models.organization import Organization
from backend.app.models.post import Post
from backend.app.models.review import Review
from backend.app.models.visibility_score import VisibilityScore
from backend.app.models.rank_snapshot import RankSnapshot
from backend.app.models.media_asset import MediaAsset


class DashboardService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_overview(
        self,
        *,
        user_id: uuid.UUID,
        organization_id: uuid.UUID | None = None,
        location_id: uuid.UUID | None = None,
    ) -> dict:
        membership, org = self._resolve_membership(user_id, organization_id)
        location = self._resolve_location(org, location_id)
        metrics = self._collect_metrics(org, location)
        tasks = self._collect_tasks(org, location)
        usage = self._usage_summary(org)
        available_orgs = self._available_orgs(user_id)
        locations = [
            {
                "id": str(loc.id),
                "name": loc.name,
            }
            for loc in org.locations
        ]
        self._record_snapshot(org, location, metrics, tasks)
        return {
            "organization": {
                "id": str(org.id),
                "name": org.name,
                "plan": org.plan_tier or "starter",
                "usage": usage,
            },
            "location": {
                "id": str(location.id) if location else None,
                "name": location.name if location else "All Locations",
            },
            "role": membership.role.value,
            "kpis": metrics,
            "tasks": tasks,
            "available_orgs": available_orgs,
            "locations": locations,
        }

    def _resolve_membership(
        self, user_id: uuid.UUID, organization_id: uuid.UUID | None
    ) -> tuple[Membership, Organization]:
        membership_query = self.db.query(Membership).filter(Membership.user_id == user_id)
        if organization_id:
            membership_query = membership_query.filter(Membership.organization_id == organization_id)
        membership = membership_query.first()
        if not membership:
            raise ValueError("User does not belong to any organization")
        organization = membership.organization
        return membership, organization

    def _resolve_location(
        self, organization: Organization, location_id: uuid.UUID | None
    ) -> Location | None:
        if location_id:
            for loc in organization.locations:
                if loc.id == location_id:
                    return loc
            raise ValueError("Location not found in organization")
        return organization.locations[0] if organization.locations else None

    def _collect_metrics(self, org: Organization, location: Location | None) -> dict:
        return {
            "posts": self._posts_metrics(org, location),
            "reviews": self._review_metrics(org, location),
            "visibility": self._visibility_metrics(org, location),
        }

    def _posts_metrics(self, org: Organization, location: Location | None) -> dict:
        window_start = datetime.now(timezone.utc) - timedelta(days=30)
        query = self.db.query(Post).filter(Post.organization_id == org.id)
        if location:
            query = query.filter(Post.location_id == location.id)
        posts = query.filter(Post.created_at >= window_start).all()
        engagement_values = [
            (post.publish_result or {}).get("engagement", 0) for post in posts
        ]
        scheduled = [
            post for post in posts if post.status in {PostStatus.SCHEDULED, PostStatus.PUBLISHED}
        ]
        return {
            "count": len(posts),
            "per_week": round(len(posts) / 4, 2),
            "engagement": round(mean(engagement_values), 2) if engagement_values else 0.0,
            "scheduled": len(scheduled),
        }

    def _review_metrics(self, org: Organization, location: Location | None) -> dict:
        window_start = datetime.now(timezone.utc) - timedelta(days=30)
        query = self.db.query(Review).filter(Review.organization_id == org.id)
        if location:
            query = query.filter(Review.location_id == location.id)
        reviews = query.filter(Review.created_at >= window_start).all()
        avg_rating = (
            round(mean([float(review.rating.value) for review in reviews]), 2)
            if reviews
            else 0.0
        )
        reply_times: list[float] = []
        for review in reviews:
            if review.reply_submitted_at:
                try:
                    reply_at = datetime.fromisoformat(review.reply_submitted_at)
                except ValueError:
                    continue
                if reply_at.tzinfo is None:
                    reply_at = reply_at.replace(tzinfo=timezone.utc)
                created = review.created_at or reply_at
                if created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
                delta = reply_at - created
                reply_times.append(delta.total_seconds() / 3600)
        return {
            "count": len(reviews),
            "per_week": round(len(reviews) / 4, 2),
            "avg_rating": avg_rating,
            "avg_reply_hours": round(mean(reply_times), 2) if reply_times else None,
        }

    def _visibility_metrics(self, org: Organization, location: Location | None) -> dict:
        query = self.db.query(VisibilityScore).filter(VisibilityScore.organization_id == org.id)
        if location:
            query = query.filter(VisibilityScore.location_id == location.id)
        latest_score = query.order_by(VisibilityScore.computed_at.desc()).first()
        rank_query = (
            self.db.query(RankSnapshot)
            .filter(RankSnapshot.organization_id == org.id)
            .order_by(RankSnapshot.checked_at.asc())
        )
        if location:
            rank_query = rank_query.filter(RankSnapshot.location_id == location.id)
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        recent_ranks = rank_query.filter(RankSnapshot.checked_at >= cutoff).all()
        if recent_ranks:
            trend = (recent_ranks[-1].rank or 0) - (recent_ranks[0].rank or 0)
        else:
            trend = 0
        return {
            "score": latest_score.score if latest_score else None,
            "trend": trend,
        }

    def _collect_tasks(self, org: Organization, location: Location | None) -> list[dict]:
        tasks: list[dict] = []
        approval_query = self.db.query(ApprovalRequest).filter(
            ApprovalRequest.organization_id == org.id,
            ApprovalRequest.status == ApprovalStatus.PENDING,
        )
        if location:
            approval_query = approval_query.filter(ApprovalRequest.location_id == location.id)
        pending_approvals = approval_query.count()
        if pending_approvals:
            tasks.append(
                {
                    "type": "approvals",
                    "count": pending_approvals,
                    "description": "Pending approvals awaiting review",
                }
            )
        if location:
            latest_media = (
                self.db.query(MediaAsset)
                .filter(MediaAsset.location_id == location.id)
                .order_by(MediaAsset.created_at.desc())
                .first()
            )
            needs_media = not latest_media or not latest_media.created_at or (
                datetime.now(timezone.utc) - latest_media.created_at > timedelta(days=14)
            )
            if needs_media:
                tasks.append(
                    {
                        "type": "media",
                        "description": "Upload new photos to keep listings fresh",
                    }
                )
        upcoming_actions = (
            self.db.query(Action)
            .filter(Action.organization_id == org.id)
            .filter(Action.status == ActionStatus.PENDING)
            .filter(Action.run_at <= datetime.now(timezone.utc) + timedelta(days=1))
            .count()
        )
        if upcoming_actions:
            tasks.append(
                {
                    "type": "scheduled_actions",
                    "count": upcoming_actions,
                    "description": "Actions scheduled within 24h",
                }
            )
        return tasks

    def _usage_summary(self, org: Organization) -> dict:
        limits = org.usage_limits_json or {"posts_per_month": 30, "locations": 5}
        start_month = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        posts_this_month = (
            self.db.query(func.count(Post.id))
            .filter(Post.organization_id == org.id)
            .filter(Post.created_at >= start_month)
            .scalar()
            or 0
        )
        return {
            "posts": {
                "used": posts_this_month,
                "limit": limits.get("posts_per_month", 30),
            },
            "locations": {
                "used": len(org.locations),
                "limit": limits.get("locations", 5),
            },
        }

    def _available_orgs(self, user_id: uuid.UUID) -> list[dict]:
        memberships = (
            self.db.query(Membership)
            .filter(Membership.user_id == user_id)
            .all()
        )
        return [
            {
                "id": str(membership.organization_id),
                "name": membership.organization.name,
                "role": membership.role.value,
            }
            for membership in memberships
        ]

    def _record_snapshot(
        self,
        org: Organization,
        location: Location | None,
        metrics: dict,
        tasks: list[dict],
    ) -> None:
        snapshot = DashboardSnapshot(
            organization_id=org.id,
            location_id=location.id if location else None,
            captured_at=datetime.now(timezone.utc),
            metrics=metrics,
            tasks={"items": tasks},
        )
        self.db.add(snapshot)
        self.db.commit()
