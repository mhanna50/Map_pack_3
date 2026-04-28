from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Sequence
import uuid

from sqlalchemy.orm import Session

from backend.app.models.enums import ActionType
from backend.app.models.geo_grid_point import GeoGridPoint
from backend.app.models.location_keyword import LocationKeyword
from backend.app.models.rank_snapshot import RankSnapshot
from backend.app.models.visibility_score import VisibilityScore
from backend.app.services.validators import assert_location_in_org
if TYPE_CHECKING:
    from backend.app.services.actions import ActionService


class RankTrackingService:
    def __init__(self, db: Session, action_service: "ActionService | None" = None) -> None:
        self.db = db
        if action_service is None:
            from backend.app.services.actions import ActionService

            action_service = ActionService(db)
        self.action_service = action_service

    def add_keyword(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        keyword: str,
        importance: int = 1,
    ) -> LocationKeyword:
        assert_location_in_org(self.db, location_id=location_id, organization_id=organization_id)
        keyword_obj = LocationKeyword(
            organization_id=organization_id,
            location_id=location_id,
            keyword=keyword.lower(),
            importance=importance,
        )
        self.db.add(keyword_obj)
        self.db.commit()
        self.db.refresh(keyword_obj)
        return keyword_obj

    def add_grid_point(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        latitude: float,
        longitude: float,
        radius_index: int = 0,
        label: str | None = None,
    ) -> GeoGridPoint:
        assert_location_in_org(self.db, location_id=location_id, organization_id=organization_id)
        point = GeoGridPoint(
            organization_id=organization_id,
            location_id=location_id,
            latitude=latitude,
            longitude=longitude,
            radius_index=radius_index,
            label=label,
        )
        self.db.add(point)
        self.db.commit()
        self.db.refresh(point)
        return point

    def schedule_rank_checks(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        keyword_ids: Sequence[uuid.UUID],
        grid_point_ids: Sequence[uuid.UUID],
        run_at: datetime,
    ) -> None:
        assert_location_in_org(self.db, location_id=location_id, organization_id=organization_id)
        payload = {
            "keyword_ids": [str(k) for k in keyword_ids],
            "grid_point_ids": [str(g) for g in grid_point_ids],
            "location_id": str(location_id),
        }
        self.action_service.schedule_action(
            organization_id=organization_id,
            action_type=ActionType.CHECK_RANKINGS,
            run_at=run_at,
            payload=payload,
            location_id=location_id,
        )

    def record_snapshot(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        keyword_id: uuid.UUID,
        grid_point_id: uuid.UUID,
        rank: int | None,
        in_pack: bool,
        competitor_name: str | None = None,
        metadata: dict | None = None,
    ) -> RankSnapshot:
        snapshot = RankSnapshot(
            organization_id=organization_id,
            location_id=location_id,
            keyword_id=keyword_id,
            grid_point_id=grid_point_id,
            checked_at=datetime.now(timezone.utc),
            rank=rank,
            in_pack=in_pack,
            competitor_name=competitor_name,
            metadata_json=metadata or {},
        )
        self.db.add(snapshot)
        self.db.commit()
        self.db.refresh(snapshot)
        return snapshot

    def calculate_visibility(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        keyword: LocationKeyword,
        snapshots: Sequence[RankSnapshot],
    ) -> VisibilityScore:
        if not snapshots:
            score_value = 0.0
        else:
            total_weight = 0
            weighted_score = 0.0
            for snap in snapshots:
                weight = keyword.importance
                total_weight += weight
                rank = snap.rank or 50
                weighted_score += weight * max(0, 50 - rank)
            score_value = weighted_score / total_weight if total_weight else 0.0
        score = VisibilityScore(
            organization_id=organization_id,
            location_id=location_id,
            keyword_id=keyword.id,
            computed_at=datetime.now(timezone.utc),
            score=score_value,
            details={"snapshots": len(snapshots)},
        )
        self.db.add(score)
        self.db.commit()
        self.db.refresh(score)
        return score
