from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any
from urllib.parse import parse_qs

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user, require_org_member
from backend.app.core.config import settings
from backend.app.db.session import get_db
from backend.app.features.lead_recovery.service import LeadRecoveryService
from backend.app.models.lead_recovery import Lead, LeadMessage, LeadNote, LeadRecoverySettings
from backend.app.services.auth.access import AccessDeniedError, AccessService

try:
    from twilio.request_validator import RequestValidator
except ImportError:  # pragma: no cover
    RequestValidator = None

client_router = APIRouter(
    prefix="/lead-recovery",
    tags=["lead_recovery"],
    dependencies=[Depends(get_current_user), Depends(require_org_member)],
)
twilio_router = APIRouter(prefix="/webhooks/twilio", tags=["twilio_webhooks"])


class LeadRecoverySettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    enabled: bool
    business_phone: str | None = None
    owner_notification_phone: str | None = None
    owner_notification_email: str | None = None
    business_name: str | None = None
    twilio_phone_number: str | None = None
    twilio_phone_sid: str | None = None
    forwarding_status: str
    verification_status: str
    last_verification_attempt_at: datetime | None = None
    verified_at: datetime | None = None
    test_call_from_phone: str | None = None
    last_test_call_sid: str | None = None
    consent_confirmed: bool
    missed_call_textback_enabled: bool
    intake_questions_enabled: bool
    owner_notifications_enabled: bool
    no_response_followup_enabled: bool
    completed_job_review_request_enabled: bool
    created_at: datetime
    updated_at: datetime


class LeadRecoverySettingsUpdate(BaseModel):
    enabled: bool | None = None
    business_phone: str | None = Field(default=None, max_length=32)
    owner_notification_phone: str | None = Field(default=None, max_length=32)
    owner_notification_email: EmailStr | None = None
    business_name: str | None = Field(default=None, max_length=255)
    twilio_phone_number: str | None = Field(default=None, max_length=32)
    twilio_phone_sid: str | None = Field(default=None, max_length=128)
    forwarding_status: str | None = Field(default=None, max_length=32)
    verification_status: str | None = Field(default=None, max_length=32)
    test_call_from_phone: str | None = Field(default=None, max_length=32)
    consent_confirmed: bool | None = None
    missed_call_textback_enabled: bool | None = None
    intake_questions_enabled: bool | None = None
    owner_notifications_enabled: bool | None = None
    no_response_followup_enabled: bool | None = None
    completed_job_review_request_enabled: bool | None = None


class LeadMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    lead_id: uuid.UUID
    direction: str
    channel: str
    body: str | None = None
    twilio_message_sid: str | None = None
    created_at: datetime


class LeadNoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    lead_id: uuid.UUID
    note: str
    created_by: uuid.UUID | None = None
    created_at: datetime


class LeadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    source: str
    customer_name: str | None = None
    customer_phone: str | None = None
    customer_email: str | None = None
    service_requested: str | None = None
    location: str | None = None
    urgency: str | None = None
    preferred_time: str | None = None
    details: str | None = None
    status: str
    owner_summary: str | None = None
    last_message_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    last_message: str | None = None


class LeadDetailResponse(LeadResponse):
    messages: list[LeadMessageResponse] = []
    notes: list[LeadNoteResponse] = []
    suggested_next_action: str


class LeadUpdate(BaseModel):
    customer_name: str | None = Field(default=None, max_length=255)
    customer_email: EmailStr | None = None
    service_requested: str | None = Field(default=None, max_length=255)
    location: str | None = Field(default=None, max_length=255)
    urgency: str | None = Field(default=None, max_length=120)
    preferred_time: str | None = Field(default=None, max_length=255)
    details: str | None = None
    status: str | None = Field(default=None, max_length=32)
    owner_summary: str | None = None


class LeadNoteCreate(BaseModel):
    note: str = Field(..., min_length=1, max_length=4000)


@client_router.get("/settings", response_model=LeadRecoverySettingsResponse)
def get_settings(
    organization_id: uuid.UUID | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> LeadRecoverySettings:
    tenant_id = _resolve_tenant_id(db, current_user.id, organization_id)
    return LeadRecoveryService(db).get_or_create_settings(tenant_id)


@client_router.patch("/settings", response_model=LeadRecoverySettingsResponse)
def update_settings(
    payload: LeadRecoverySettingsUpdate,
    organization_id: uuid.UUID | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> LeadRecoverySettings:
    tenant_id = _resolve_tenant_id(db, current_user.id, organization_id)
    values = payload.model_dump(exclude_unset=True)
    try:
        return LeadRecoveryService(db).update_settings(tenant_id, values)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@client_router.post("/settings/assign-number", response_model=LeadRecoverySettingsResponse)
def assign_number(
    organization_id: uuid.UUID | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> LeadRecoverySettings:
    tenant_id = _resolve_tenant_id(db, current_user.id, organization_id)
    try:
        return LeadRecoveryService(db).assign_recovery_number(tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@client_router.post("/settings/start-verification", response_model=LeadRecoverySettingsResponse)
def start_verification(
    payload: dict[str, Any] | None = None,
    organization_id: uuid.UUID | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> LeadRecoverySettings:
    tenant_id = _resolve_tenant_id(db, current_user.id, organization_id)
    test_call_from_phone = payload.get("test_call_from_phone") if payload else None
    try:
        return LeadRecoveryService(db).start_verification(
            tenant_id,
            test_call_from_phone=str(test_call_from_phone) if test_call_from_phone else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@client_router.post("/settings/skip", response_model=LeadRecoverySettingsResponse)
def skip_setup(
    organization_id: uuid.UUID | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> LeadRecoverySettings:
    tenant_id = _resolve_tenant_id(db, current_user.id, organization_id)
    return LeadRecoveryService(db).skip_setup(tenant_id)


@client_router.get("/leads", response_model=list[LeadResponse])
def list_leads(
    organization_id: uuid.UUID | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[LeadResponse]:
    tenant_id = _resolve_tenant_id(db, current_user.id, organization_id)
    return [_lead_response(lead) for lead in LeadRecoveryService(db).list_leads(tenant_id, limit=limit)]


@client_router.get("/leads/{lead_id}", response_model=LeadDetailResponse)
def get_lead(
    lead_id: uuid.UUID,
    organization_id: uuid.UUID | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> LeadDetailResponse:
    tenant_id = _resolve_tenant_id(db, current_user.id, organization_id)
    lead = LeadRecoveryService(db).get_lead(tenant_id, lead_id)
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    return _lead_detail_response(lead)


@client_router.patch("/leads/{lead_id}", response_model=LeadResponse)
def update_lead(
    lead_id: uuid.UUID,
    payload: LeadUpdate,
    organization_id: uuid.UUID | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> LeadResponse:
    tenant_id = _resolve_tenant_id(db, current_user.id, organization_id)
    try:
        lead = LeadRecoveryService(db).update_lead(tenant_id, lead_id, payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    return _lead_response(lead)


@client_router.post("/leads/{lead_id}/notes", response_model=LeadNoteResponse, status_code=status.HTTP_201_CREATED)
def add_note(
    lead_id: uuid.UUID,
    payload: LeadNoteCreate,
    organization_id: uuid.UUID | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> LeadNote:
    tenant_id = _resolve_tenant_id(db, current_user.id, organization_id)
    try:
        return LeadRecoveryService(db).add_note(tenant_id, lead_id, payload.note, current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@client_router.post("/leads/{lead_id}/mark-contacted", response_model=LeadResponse)
def mark_contacted(lead_id: uuid.UUID, organization_id: uuid.UUID | None = Query(None), db: Session = Depends(get_db), current_user=Depends(get_current_user)) -> LeadResponse:
    return _mark(lead_id, "contacted", organization_id, db, current_user)


@client_router.post("/leads/{lead_id}/mark-booked", response_model=LeadResponse)
def mark_booked(lead_id: uuid.UUID, organization_id: uuid.UUID | None = Query(None), db: Session = Depends(get_db), current_user=Depends(get_current_user)) -> LeadResponse:
    return _mark(lead_id, "booked", organization_id, db, current_user)


@client_router.post("/leads/{lead_id}/mark-lost", response_model=LeadResponse)
def mark_lost(lead_id: uuid.UUID, organization_id: uuid.UUID | None = Query(None), db: Session = Depends(get_db), current_user=Depends(get_current_user)) -> LeadResponse:
    return _mark(lead_id, "lost", organization_id, db, current_user)


@client_router.post("/leads/{lead_id}/mark-completed", response_model=LeadResponse)
def mark_completed(lead_id: uuid.UUID, organization_id: uuid.UUID | None = Query(None), db: Session = Depends(get_db), current_user=Depends(get_current_user)) -> LeadResponse:
    return _mark(lead_id, "completed", organization_id, db, current_user)


@twilio_router.post("/voice")
async def twilio_voice(request: Request, db: Session = Depends(get_db)) -> Response:
    form = await _validated_twilio_form(request)
    lead, result = LeadRecoveryService(db).handle_missed_call(
        called_number=_first(form, "To", "Called"),
        caller_number=_first(form, "From", "Caller"),
        call_sid=_first(form, "CallSid"),
    )
    twiml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<Response><Say>Thanks for calling. The team has been notified.</Say><Hangup /></Response>"
    )
    return Response(content=twiml, media_type="application/xml", headers={"X-Lead-Recovery-Result": result})


@twilio_router.post("/sms/inbound")
async def twilio_sms_inbound(request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    form = await _validated_twilio_form(request)
    lead, result, response = LeadRecoveryService(db).handle_inbound_sms(
        to_number=_first(form, "To"),
        from_number=_first(form, "From"),
        body=_first(form, "Body"),
        message_sid=_first(form, "MessageSid", "SmsSid"),
    )
    return {"status": result, "lead_id": str(lead.id) if lead else None, "response": response}


@twilio_router.post("/sms/status")
async def twilio_sms_status(request: Request, db: Session = Depends(get_db)) -> dict[str, str]:
    await _validated_twilio_form(request)
    return {"status": "received"}


def _mark(lead_id: uuid.UUID, new_status: str, organization_id: uuid.UUID | None, db: Session, current_user) -> LeadResponse:
    tenant_id = _resolve_tenant_id(db, current_user.id, organization_id)
    try:
        lead = LeadRecoveryService(db).set_status(tenant_id, lead_id, new_status)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    return _lead_response(lead)


def _resolve_tenant_id(db: Session, user_id: uuid.UUID, organization_id: uuid.UUID | None) -> uuid.UUID:
    try:
        _, org = AccessService(db).resolve_org(user_id=user_id, organization_id=organization_id)
    except AccessDeniedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    if db.bind and db.bind.dialect.name == "postgresql":
        db.execute(text("SET LOCAL app.current_org = :org_id"), {"org_id": str(org.id)})
    return org.id


def _lead_response(lead: Lead) -> LeadResponse:
    last_message = _last_message(lead.messages)
    return LeadResponse(
        id=lead.id,
        tenant_id=lead.tenant_id,
        source=lead.source,
        customer_name=lead.customer_name,
        customer_phone=lead.customer_phone,
        customer_email=lead.customer_email,
        service_requested=lead.service_requested,
        location=lead.location,
        urgency=lead.urgency,
        preferred_time=lead.preferred_time,
        details=lead.details,
        status=lead.status,
        owner_summary=lead.owner_summary,
        last_message_at=lead.last_message_at,
        created_at=lead.created_at,
        updated_at=lead.updated_at,
        last_message=last_message.body if last_message else None,
    )


def _lead_detail_response(lead: Lead) -> LeadDetailResponse:
    base = _lead_response(lead).model_dump()
    return LeadDetailResponse(
        **base,
        messages=list(sorted(lead.messages, key=lambda item: item.created_at)),
        notes=list(sorted(lead.notes, key=lambda item: item.created_at, reverse=True)),
        suggested_next_action=_suggested_next_action(lead),
    )


def _last_message(messages: list[LeadMessage]) -> LeadMessage | None:
    if not messages:
        return None
    return sorted(messages, key=lambda item: item.created_at, reverse=True)[0]


def _suggested_next_action(lead: Lead) -> str:
    if lead.status in {"new", "auto_contacted", "responded", "qualified"}:
        return "Call or text this lead as soon as possible."
    if lead.status == "booked":
        return "Complete the job, then mark the lead completed."
    if lead.status == "completed":
        return "Review request is available if enabled."
    return "Review the conversation and update the status."


async def _validated_twilio_form(request: Request) -> dict[str, str]:
    raw_body = await request.body()
    form = {key: values[-1] for key, values in parse_qs(raw_body.decode(), keep_blank_values=True).items()}
    token = settings.TWILIO_AUTH_TOKEN
    signature = request.headers.get("X-Twilio-Signature")
    if not token:
        if settings.ALLOW_UNSIGNED_TWILIO_WEBHOOKS:
            return form
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Twilio webhook signing is not configured")
    if RequestValidator is not None:
        validator = RequestValidator(token)
        url = str(request.url)
        if not signature or not validator.validate(url, form, signature):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid Twilio signature")
    else:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Twilio validator unavailable")
    return form


def _first(form: dict[str, str], *keys: str) -> str | None:
    for key in keys:
        value = form.get(key)
        if value:
            return value
    return None


api_router = APIRouter()
api_router.include_router(client_router)
api_router.include_router(twilio_router)
