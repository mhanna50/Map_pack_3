from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any, Sequence
import random
import uuid

from sqlalchemy.orm import Session

from backend.app.models.enums import ActionType, QnaStatus
from backend.app.models.qna_entry import QnaEntry

if TYPE_CHECKING:
    from backend.app.services.actions import ActionService

QUESTION_LIBRARY = {
    "default": [
        "What services do you offer in {city}?",
        "How quickly can you schedule {service}?",
        "Do you provide warranties on {service}?",
    ],
    "competitor_gap": [
        "Why choose us over {competitor} for {service}?",
        "Do you serve neighbourhoods near {landmark}?",
    ],
}


class QnaService:
    def __init__(self, db: Session, action_service: "ActionService | None" = None) -> None:
        self.db = db
        self.action_service = action_service

    def generate_qna(
        self,
        *,
        organization_id: uuid.UUID,
        location_id: uuid.UUID,
        connected_account_id: uuid.UUID | None,
        categories: Sequence[str],
        services: Sequence[str],
        cities: Sequence[str],
        competitor_names: Sequence[str] | None = None,
        scheduled_at: datetime | None = None,
    ) -> QnaEntry:
        category = categories[0] if categories else "default"
        template_pool = QUESTION_LIBRARY.get(category, QUESTION_LIBRARY["default"])
        template = template_pool[0]
        service = services[0] if services else "your service"
        city = cities[0] if cities else "your area"
        competitor = competitor_names[0] if competitor_names else "other providers"
        question = template.format(service=service, city=city, competitor=competitor, landmark=city)
        existing = (
            self.db.query(QnaEntry)
            .filter(QnaEntry.location_id == location_id, QnaEntry.question == question)
            .one_or_none()
        )
        if existing:
            return existing
        answer = (
            f"We provide {service} for residents in {city} with flexible scheduling "
            f"and transparent pricing. Contact us to book today."
        )
        qna = QnaEntry(
            organization_id=organization_id,
            location_id=location_id,
            connected_account_id=connected_account_id,
            question=question,
            answer=answer,
            category=category,
            keywords=list(services),
            status=QnaStatus.SCHEDULED if scheduled_at else QnaStatus.DRAFT,
            scheduled_at=scheduled_at,
        )
        self.db.add(qna)
        self.db.commit()
        self.db.refresh(qna)
        if scheduled_at:
            self._schedule_publish(qna)
        return qna

    def mark_posted(self, qna: QnaEntry) -> QnaEntry:
        qna.status = QnaStatus.PUBLISHED
        qna.posted_at = datetime.now(timezone.utc)
        qna.last_refreshed_at = qna.posted_at
        self.db.add(qna)
        self.db.commit()
        self.db.refresh(qna)
        return qna

    def needs_refresh(self, qna: QnaEntry, now: datetime | None = None) -> bool:
        now = now or datetime.now(timezone.utc)
        if not qna.posted_at:
            return False
        return now - qna.posted_at >= timedelta(days=90)

    def queue_refresh(self, qna: QnaEntry) -> None:
        qna.status = QnaStatus.NEEDS_REFRESH
        qna.scheduled_at = datetime.now(timezone.utc)
        self.db.add(qna)
        self.db.commit()
        self._schedule_publish(qna)

    def _schedule_publish(self, qna: QnaEntry) -> None:
        if not qna.scheduled_at:
            return
        if not self.action_service:
            from backend.app.services.actions import ActionService

            self.action_service = ActionService(self.db)
        self.action_service.schedule_action(
            organization_id=qna.organization_id,
            action_type=ActionType.PUBLISH_QA,
            run_at=qna.scheduled_at,
            payload={"qna_id": str(qna.id)},
            location_id=qna.location_id,
            connected_account_id=qna.connected_account_id,
            dedupe_key=f"qna:{qna.id}",
        )
