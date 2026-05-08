from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
import uuid

from sqlalchemy.orm import Session

from backend.app.models.job import Job


class JobService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def dispatch_job(
        self,
        *,
        organization_id: uuid.UUID,
        job_type: str,
        location_id: uuid.UUID | None = None,
        payload: dict | None = None,
    ) -> Job:
        job = Job(
            organization_id=organization_id,
            contact_id=None,
            location_id=location_id,
            job_type=job_type,
            status="queued",
            payload_json=payload or {},
            run_at=datetime.now(timezone.utc),
            started_at=None,
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def latest_runs(
        self,
        organization_id: uuid.UUID,
        job_types: list[str],
    ) -> dict[str, dict[str, Any]]:
        result: dict[str, dict[str, Any]] = {}
        for job_type in job_types:
            job = (
                self.db.query(Job)
                .filter(Job.organization_id == organization_id, Job.job_type == job_type)
                .order_by(Job.finished_at.desc().nullslast(), Job.created_at.desc())
                .first()
            )
            if not job:
                continue
            result[job_type] = {
                "last_run_at": job.finished_at or job.started_at or job.run_at,
                "last_status": job.status,
                "next_run_at": None,
            }
        return result
