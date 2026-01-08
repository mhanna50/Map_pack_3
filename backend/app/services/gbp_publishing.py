from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
import uuid

from sqlalchemy.orm import Session

from backend.app.models.post import Post
from backend.app.models.review import Review
from backend.app.services.audit import log_audit
from backend.app.services.gbp_connections import GbpConnectionService
from backend.app.services.google import GoogleBusinessClient, GoogleOAuthService


class GbpPublishingService:
    """Publishes GBP posts and review replies using stored connections."""

    LANGUAGE_CODE = "en-US"

    def __init__(self, db: Session) -> None:
        self.db = db
        self.connections = GbpConnectionService(db)
        self.oauth = GoogleOAuthService()

    def publish_post(self, post: Post) -> dict[str, Any]:
        client = self._client(post.organization_id)
        location = post.location
        if not location or not location.google_location_id:
            raise ValueError("Location missing Google Location ID")
        payload = {
            "languageCode": self.LANGUAGE_CODE,
            "summary": post.body,
            "topicType": self._topic_type(post.post_type.value if post.post_type else "update"),
        }
        result = client.create_local_post(location.google_location_id, payload)
        post.publish_result = result
        post.status = post.status  # ensure SQLAlchemy detects change
        post.published_at = post.published_at or datetime.now(timezone.utc)
        self.db.add(post)
        self.db.commit()
        self.db.refresh(post)
        log_audit(
            self.db,
            action="gbp.post.published",
            actor=None,
            org_id=post.organization_id,
            entity="post",
            entity_id=str(post.id),
            metadata={"google_resource": result.get("name")},
        )
        return result

    def reply_to_review(self, review: Review, reply_body: str) -> dict[str, Any]:
        client = self._client(review.organization_id)
        if not review.metadata_json or "name" not in review.metadata_json:
            raise ValueError("Missing Google review resource name")
        result = client.reply_to_review(review.metadata_json["name"], reply_body)
        review.reply_comment = reply_body
        review.reply_submitted_at = datetime.now(timezone.utc).isoformat()
        self.db.add(review)
        self.db.commit()
        self.db.refresh(review)
        log_audit(
            self.db,
            action="gbp.review.replied",
            actor=None,
            org_id=review.organization_id,
            entity="review",
            entity_id=str(review.id),
            metadata={"google_resource": review.metadata_json.get("name")},
        )
        return result

    def _client(self, organization_id: uuid.UUID) -> GoogleBusinessClient:
        connection = self.connections.get_by_org(organization_id)
        if not connection:
            raise ValueError("Organization does not have a GBP connection")
        token = self.connections.ensure_access_token(connection, refresh_callback=self.oauth.refresh_access_token)
        return GoogleBusinessClient(token)

    @staticmethod
    def _topic_type(post_type: str) -> str:
        mapping = {
            "offer": "OFFER",
            "event": "EVENT",
        }
        return mapping.get(post_type.lower(), "STANDARD")
