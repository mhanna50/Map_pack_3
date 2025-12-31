from fastapi import FastAPI
from app.api.health import router as health_router

app = FastAPI(title="Map 3-Pack API")

app.include_router(health_router, prefix="/api")

@app.get("/")
def root():
    return {"ok": True, "service": "backend"}
