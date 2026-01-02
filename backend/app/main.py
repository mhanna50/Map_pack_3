from fastapi import FastAPI

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

app = FastAPI(title="Map 3-Pack API")

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


@app.get("/")
def root():
    return {"ok": True, "service": "backend"}
