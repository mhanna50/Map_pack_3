from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.router import api_router

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

app.include_router(api_router, prefix="/api")


@app.get("/")
def root():
    return {"ok": True, "service": "backend"}
