from fastapi import APIRouter

from backend.app.features.actions.router import router as actions_router
from backend.app.features.admin.alerts_router import router as admin_alerts_router
from backend.app.features.admin.approvals_router import router as admin_approvals_router
from backend.app.features.admin.audit_router import router as admin_audit_router
from backend.app.features.admin.observability_router import router as admin_observability_router
from backend.app.features.admin.org_automations_router import router as admin_org_automations_router
from backend.app.features.admin.orgs_router import router as admin_orgs_router
from backend.app.features.approvals.router import router as approvals_router
from backend.app.features.auth.router import router as auth_router
from backend.app.features.automation.router import router as automation_router
from backend.app.features.dashboard.router import router as dashboard_router
from backend.app.features.google_business.optimization_router import router as optimization_router
from backend.app.features.google_business.org_gbp_router import router as org_gbp_router
from backend.app.features.google_business.router import router as google_router
from backend.app.features.posts.media_router import router as media_router
from backend.app.features.posts.router import router as posts_router
from backend.app.features.qna.router import router as qna_router
from backend.app.features.rank_tracking.competitors_router import router as competitors_router
from backend.app.features.rank_tracking.keyword_strategy_router import router as keyword_strategy_router
from backend.app.features.rank_tracking.router import router as rankings_router
from backend.app.features.stripe_billing.router import router as billing_router
from backend.app.features.tenants.router import router as orgs_router

from .health import router as health_router

api_router = APIRouter()

api_router.include_router(health_router)
api_router.include_router(orgs_router)
api_router.include_router(actions_router)
api_router.include_router(google_router)
api_router.include_router(posts_router)
api_router.include_router(qna_router)
api_router.include_router(rankings_router)
api_router.include_router(optimization_router)
api_router.include_router(media_router)
api_router.include_router(competitors_router)
api_router.include_router(automation_router)
api_router.include_router(approvals_router)
api_router.include_router(dashboard_router)
api_router.include_router(billing_router)
api_router.include_router(org_gbp_router)
api_router.include_router(admin_orgs_router)
api_router.include_router(admin_approvals_router)
api_router.include_router(admin_org_automations_router)
api_router.include_router(admin_alerts_router)
api_router.include_router(admin_audit_router)
api_router.include_router(admin_observability_router)
api_router.include_router(auth_router)
api_router.include_router(keyword_strategy_router)
