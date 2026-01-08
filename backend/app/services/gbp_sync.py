from __future__ import annotations

from datetime import datetime, timezone
import uuid

from sqlalchemy.orm import Session

from backend.app.models.enums import ReviewRating, ReviewStatus
from backend.app.models.location import Location
from backend.app.models.post import Post
from backend.app.models.review import Review
from backend.app.services.gbp_connections import GbpConnectionService
from backend.app.services.google import GoogleBusinessClient, GoogleOAuthService


class GbpSyncService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.connections = GbpConnectionService(db)
        self.oauth = GoogleOAuthService()

    def sync_reviews(self, organization_id: uuid.UUID, location_id: uuid.UUID) -> int:
        location = self.db.get(Location, location_id)
        if not location or not location.google_location_id:
            raise ValueError("Location missing Google Location ID")
        client = self._client(organization_id)
        reviews_data = client.list_reviews(location.google_location_id)
        count = 0
        for data in reviews_data:
            review_name = data.get("name")
            if not review_name:
                continue
            review = (
                self.db.query(Review)
                .filter(Review.organization_id == organization_id, Review.external_review_id == review_name)
                .one_or_none()
            )
            rating_value = str(data.get("starRating", "3"))
            rating = ReviewRating[rating_value] if rating_value in ReviewRating.__members__ else ReviewRating.THREE
            comment = data.get("comment", "")
            author_name = data.get("reviewer", {}).get("displayName")
            if review:
                review.comment = comment
                review.author_name = author_name or review.author_name
                review.rating = rating
            else:
                review = Review(
                    organization_id=organization_id,
                    location_id=location_id,
                    external_review_id=review_name,
                    rating=rating,
                    comment=comment,
                    author_name=author_name,
                )
            review.metadata_json = data
            self.db.add(review)
            count += 1
        location.reviews_last_synced_at = datetime.now(timezone.utc)
        self.db.add(location)
        self.db.commit()
        return count

    def sync_posts(self, organization_id: uuid.UUID, location_id: uuid.UUID) -> int:
        location = self.db.get(Location, location_id)
        if not location or not location.google_location_id:
            raise ValueError("Location missing Google Location ID")
        client = self._client(organization_id)
        posts = client.list_local_posts(location.google_location_id)
        count = 0
        for data in posts:
            resource_name = data.get("name")
            if not resource_name:
                continue
            post = (
                self.db.query(Post)
                .filter(Post.organization_id == organization_id, Post.external_post_id == resource_name)
                .one_or_none()
            )
            if not post:
                post = Post(
                    organization_id=organization_id,
                    location_id=location_id,
                    body=data.get("summary") or "",
                )
            post.external_post_id = resource_name
            post.publish_result = data
            post.status = post.status
            post.published_at = post.published_at or datetime.now(timezone.utc)
            self.db.add(post)
            count += 1
        self.db.commit()
        return count

    def _client(self, organization_id: uuid.UUID) -> GoogleBusinessClient:
        connection = self.connections.get_by_org(organization_id)
        if not connection:
            raise ValueError("Organization does not have a GBP connection")
        token = self.connections.ensure_access_token(connection, refresh_callback=self.oauth.refresh_access_token)
        return GoogleBusinessClient(token)
