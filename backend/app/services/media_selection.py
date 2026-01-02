from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from backend.app.models.media_asset import MediaAsset


class MediaSelector:
    def __init__(self, db: Session, freshness_days: int = 30) -> None:
        self.db = db
        self.freshness_window = timedelta(days=freshness_days)

    def pick_asset(self, *, location_id, theme: str | None = None) -> MediaAsset | None:
        query = self.db.query(MediaAsset).filter(MediaAsset.location_id == location_id)
        assets = query.all()
        if theme:
            assets = [
                asset
                for asset in assets
                if asset.categories and theme in set(asset.categories)
            ]
        assets.sort(
            key=lambda asset: (
                asset.last_used_at or datetime.min.replace(tzinfo=timezone.utc),
                asset.created_at,
            )
        )
        if not assets:
            return None
        now = datetime.now(timezone.utc)
        freshness_cutoff = now - self.freshness_window
        eligible = [
            asset
            for asset in assets
            if not asset.last_used_at or asset.last_used_at <= freshness_cutoff
        ]
        asset = eligible[0] if eligible else assets[0]
        if asset:
            asset.last_used_at = datetime.now(timezone.utc)
            self.db.add(asset)
            self.db.commit()
            self.db.refresh(asset)
        return asset
