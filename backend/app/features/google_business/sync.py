from __future__ import annotations

from datetime import datetime, timezone
import uuid

from sqlalchemy.orm import Session

from backend.app.models.enums import MediaStatus, MediaType, ReviewRating, ReviewStatus
from backend.app.models.google_business.location import Location
from backend.app.models.media.media_asset import MediaAsset
from backend.app.models.posts.post import Post
from backend.app.models.reviews.review import Review
from backend.app.services.google_business.gbp_connections import GbpConnectionService
from backend.app.services.google_business.google import GoogleBusinessClient, GoogleOAuthService


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

    def sync_media(self, organization_id: uuid.UUID, location_id: uuid.UUID) -> int:
        location = self.db.get(Location, location_id)
        if not location or not location.google_location_id:
            raise ValueError("Location missing Google Location ID")
        client = self._client(organization_id)
        media_items = client.list_media(location.google_location_id)
        count = 0
        for data in media_items:
            source_external_id = data.get("name")
            storage_url = data.get("googleUrl") or data.get("thumbnailUrl")
            if not source_external_id or not storage_url:
                continue
            existing = (
                self.db.query(MediaAsset)
                .filter(MediaAsset.organization_id == organization_id)
                .filter(MediaAsset.location_id == location_id)
                .filter(MediaAsset.source == "gbp")
                .filter(MediaAsset.source_external_id == source_external_id)
                .one_or_none()
            )
            categories = self._media_categories(data)
            metadata = dict(existing.metadata_json or {}) if existing else {}
            metadata.update(
                {
                    "gbp_media": data,
                    "source": "gbp",
                    "imported_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            if existing:
                existing.storage_url = storage_url
                existing.file_name = existing.file_name or self._media_file_name(source_external_id)
                existing.categories = self._merge_categories(existing.categories, categories)
                existing.metadata_json = metadata
                existing.description = existing.description or data.get("description")
                existing.status = MediaStatus.APPROVED
                self.db.add(existing)
                count += 1
                continue

            created_at = self._parse_time(data.get("createTime"))
            asset = MediaAsset(
                organization_id=organization_id,
                location_id=location_id,
                source="gbp",
                source_external_id=source_external_id,
                storage_url=storage_url,
                file_name=self._media_file_name(source_external_id),
                media_type=self._media_type(data.get("mediaFormat")),
                categories=categories,
                description=data.get("description"),
                status=MediaStatus.APPROVED,
                metadata_json=metadata,
                created_at=created_at or datetime.now(timezone.utc),
            )
            self.db.add(asset)
            count += 1
        location.last_sync_at = datetime.now(timezone.utc)
        self.db.add(location)
        self.db.commit()
        return count

    def _client(self, organization_id: uuid.UUID) -> GoogleBusinessClient:
        connection = self.connections.get_by_org(organization_id)
        if not connection:
            raise ValueError("Organization does not have a GBP connection")
        token = self.connections.ensure_access_token(connection, refresh_callback=self.oauth.refresh_access_token)
        return GoogleBusinessClient(token)

    @staticmethod
    def _media_file_name(source_external_id: str) -> str:
        value = source_external_id.rsplit("/", 1)[-1]
        return f"{value}.jpg" if "." not in value else value

    @staticmethod
    def _media_categories(data: dict) -> list[str]:
        values: list[str] = []
        media_format = data.get("mediaFormat")
        if media_format:
            values.append(str(media_format).lower())
        category = data.get("category")
        if category:
            values.append(str(category).lower())
        association = data.get("association") if isinstance(data.get("association"), dict) else {}
        if association.get("category"):
            values.append(str(association["category"]).lower())
        description = data.get("description")
        if isinstance(description, str):
            for token in description.lower().replace("_", " ").split():
                if len(token) >= 4:
                    values.append(token)
        deduped: list[str] = []
        for item in values:
            if item not in deduped:
                deduped.append(item)
        return deduped

    @staticmethod
    def _merge_categories(current: list[str] | None, incoming: list[str] | None) -> list[str]:
        merged: list[str] = []
        for value in (current or []) + (incoming or []):
            if value not in merged:
                merged.append(value)
        return merged

    @staticmethod
    def _parse_time(raw: str | None) -> datetime | None:
        if not raw or not isinstance(raw, str):
            return None
        try:
            value = raw.replace("Z", "+00:00")
            parsed = datetime.fromisoformat(value)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except Exception:  # noqa: BLE001
            return None

    @staticmethod
    def _media_type(raw: str | None) -> MediaType:
        value = (raw or "").upper()
        if "VIDEO" in value:
            return MediaType.VIDEO
        return MediaType.IMAGE
