from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any
import uuid

from sqlalchemy.orm import Session

from backend.app.models.enums import ActionType, PostStatus, PostType
from backend.app.models.post import Post
from backend.app.models.post_media_attachment import PostMediaAttachment
from backend.app.models.post_variant import PostVariant
from backend.app.models.media_asset import MediaAsset
from backend.app.services.captions import CaptionGenerator
from backend.app.services.media_selection import MediaSelector
from backend.app.services.rotation import RotationEngine

if TYPE_CHECKING:
    from backend.app.services.actions import ActionService


class PostService:
    def __init__(self, db: Session, action_service: "ActionService | None" = None) -> None:
        self.db = db
        self.action_service = action_service

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
    ) -> Post:
        post = Post(
            organization_id=organization_id,
            location_id=location_id,
            connected_account_id=connected_account_id,
            post_type=post_type,
            body=base_prompt,
            ai_prompt_context=context,
            scheduled_at=scheduled_at,
            status=PostStatus.SCHEDULED if scheduled_at else PostStatus.DRAFT,
        )
        self.db.add(post)
        self.db.flush()

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

        if scheduled_at:
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
