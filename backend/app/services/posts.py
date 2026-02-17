from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any
import uuid

from sqlalchemy.orm import Session

from backend.app.models.enums import ActionType, PostStatus, PostType, ApprovalCategory
from backend.app.models.post import Post
from backend.app.models.post_media_attachment import PostMediaAttachment
from backend.app.models.post_variant import PostVariant
from backend.app.models.media_asset import MediaAsset
from backend.app.services.validators import (
    assert_location_in_org,
    assert_connected_account_in_org,
)
from backend.app.services.captions import CaptionGenerator
from backend.app.services.media_selection import MediaSelector
from backend.app.services.rotation import RotationEngine
from backend.app.services.scheduling import AutoScheduler
from backend.app.services.posting_safety import PostingSafetyService
from backend.app.services.approvals import ApprovalService

if TYPE_CHECKING:
    from backend.app.services.actions import ActionService


class PostService:
    def __init__(self, db: Session, action_service: "ActionService | None" = None) -> None:
        self.db = db
        self.action_service = action_service
        self.scheduler = AutoScheduler(db)
        self.safety = PostingSafetyService(db)
        self.approvals = ApprovalService(db)

    def validate_scope(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        connected_account_id: uuid.UUID | None,
    ) -> None:
        assert_location_in_org(self.db, location_id=location_id, organization_id=organization_id)
        if connected_account_id:
            assert_connected_account_in_org(
                self.db,
                connected_account_id=connected_account_id,
                organization_id=organization_id,
            )

    def create_post(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        connected_account_id: uuid.UUID | None,
        post_type: PostType,
        base_prompt: str,
        scheduled_at: datetime | None,
        context: dict[str, Any],
        brand_voice: dict | None = None,
        services: list[str] | None = None,
        keywords: list[str] | None = None,
        locations: list[str] | None = None,
        variants: int = 3,
        bucket: str | None = None,
        topic_tags: list[str] | None = None,
        media_asset_id: uuid.UUID | None = None,
        window_id: str | None = None,
    ) -> Post:
        scheduled_time = scheduled_at or self.scheduler.next_post_time(
            organization_id=organization_id, location_id=location_id
        )
        self.safety.validate(
            organization_id=organization_id,
            location_id=location_id,
            scheduled_at=scheduled_time,
            bucket=bucket,
        )
        post = Post(
            organization_id=organization_id,
                location_id=location_id,
                connected_account_id=connected_account_id,
                post_type=post_type,
                body=base_prompt,
                ai_prompt_context=context,
                scheduled_at=scheduled_time,
                status=PostStatus.SCHEDULED,
                bucket=bucket,
                topic_tags=topic_tags or [],
                media_asset_id=media_asset_id,
                window_id=window_id,
            )
        self.db.add(post)
        self.db.flush()

        if media_asset_id:
            asset = self.db.get(MediaAsset, media_asset_id)
            if asset:
                asset.last_used_at = datetime.now(timezone.utc)
                self.db.add(asset)

        generator = CaptionGenerator(brand_voice)
        for variant_payload in generator.generate_variants(
            base_prompt=base_prompt,
            services=services or [],
            keywords=keywords or [],
            locations=locations or [],
            count=variants,
            post_type=post_type,
        ):
            variant = PostVariant(
                post_id=post.id,
                body=variant_payload["body"],
                compliance_flags=variant_payload["compliance_flags"],
            )
            self.db.add(variant)

        if self._requires_pricing_approval(base_prompt):
            post.status = PostStatus.DRAFT
            self.db.add(post)
            self.approvals.create_request(
                organization_id=organization_id,
                location_id=location_id,
                category=ApprovalCategory.GBP_EDIT,
                reason="Pricing or discount language detected",
                payload={"post_id": str(post.id)},
                source={"caption": base_prompt},
                proposal={"caption": base_prompt},
                severity="warning",
            )
        elif scheduled_time:
            self._schedule_publish_action(post)

        self.db.commit()
        self.db.refresh(post)
        return post

    def update_post_status(self, post: Post, status: PostStatus) -> Post:
        post.status = status
        self.db.add(post)
        self.db.commit()
        self.db.refresh(post)
        return post

    def attach_media(self, post: Post, asset: MediaAsset) -> None:
        attachment = PostMediaAttachment(post_id=post.id, media_asset_id=asset.id)
        self.db.add(attachment)
        asset.last_used_at = datetime.now(timezone.utc)
        self.db.add(asset)
        self.db.commit()

    def select_rotation_values(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        services: list[str],
        keywords: list[str],
        cities: list[str],
    ) -> dict[str, str | None]:
        engine = RotationEngine(self.db)
        return {
            "service": engine.select_next(
                organization_id=organization_id,
                location_id=location_id,
                key="service",
                candidates=services,
            ),
            "keyword": engine.select_next(
                organization_id=organization_id,
                location_id=location_id,
                key="keyword",
                candidates=keywords,
            ),
            "city": engine.select_next(
                organization_id=organization_id,
                location_id=location_id,
                key="city",
                candidates=cities,
            ),
        }

    def auto_select_media(
        self, *, location_id: uuid.UUID, theme: str | None = None
    ) -> MediaAsset | None:
        selector = MediaSelector(self.db)
        return selector.pick_asset(location_id=location_id, theme=theme)

    def _schedule_publish_action(self, post: Post) -> None:
        if not post.scheduled_at:
            return
        if not self.action_service:
            from backend.app.services.actions import ActionService

            self.action_service = ActionService(self.db)
        self.action_service.schedule_action(
            organization_id=post.organization_id,
            action_type=ActionType.PUBLISH_GBP_POST,
            run_at=post.scheduled_at,
            payload={"post_id": str(post.id)},
            location_id=post.location_id,
            connected_account_id=post.connected_account_id,
            dedupe_key=f"post:{post.id}",
        )

    def _requires_pricing_approval(self, text: str) -> bool:
        lowered = text.lower()
        triggers = ["%", "discount", "sale", "save ", "$"]
        return any(token in lowered for token in triggers)
