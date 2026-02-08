from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.actions import router as actions_router
from .api.google import router as google_router
from .api.health import router as health_router
from .api.orgs import router as orgs_router
from .api.posts import router as posts_router
from .api.qna import router as qna_router
from .api.rankings import router as rankings_router
from .api.optimization import router as optimization_router
from .api.media import router as media_router
from .api.competitors import router as competitors_router
from .api.automation import router as automation_router
from .api.approvals import router as approvals_router
from .api.dashboard import router as dashboard_router
from .api.billing import router as billing_router
from .api.org_gbp import router as org_gbp_router
from .api.admin_orgs import router as admin_orgs_router
from .api.admin_approvals import router as admin_approvals_router
from .api.admin_org_automations import router as admin_org_automations_router
from .api.admin_alerts import router as admin_alerts_router
from .api.admin_audit import router as admin_audit_router
from .api.admin_observability import router as admin_observability_router
from .api.auth import router as auth_router

app = FastAPI(title="Map 3-Pack API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api")
app.include_router(orgs_router, prefix="/api")
app.include_router(actions_router, prefix="/api")
app.include_router(google_router, prefix="/api")
app.include_router(posts_router, prefix="/api")
app.include_router(qna_router, prefix="/api")
app.include_router(rankings_router, prefix="/api")
app.include_router(optimization_router, prefix="/api")
app.include_router(media_router, prefix="/api")
app.include_router(competitors_router, prefix="/api")
app.include_router(automation_router, prefix="/api")
app.include_router(approvals_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(billing_router, prefix="/api")
app.include_router(org_gbp_router, prefix="/api")
app.include_router(admin_orgs_router, prefix="/api")
app.include_router(admin_approvals_router, prefix="/api")
app.include_router(admin_org_automations_router, prefix="/api")
app.include_router(admin_alerts_router, prefix="/api")
app.include_router(admin_audit_router, prefix="/api")
app.include_router(admin_observability_router, prefix="/api")
app.include_router(auth_router, prefix="/api")


@app.get("/")
def root():
    return {"ok": True, "service": "backend"}
