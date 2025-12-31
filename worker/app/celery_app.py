import os
from celery import Celery
from dotenv import load_dotenv

# Load root .env when running locally (repo root assumed)
load_dotenv()

broker = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
backend = os.getenv("CELERY_RESULT_BACKEND", broker)

celery_app = Celery(
    "worker",
    broker=broker,
    backend=backend,
    include=["app.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)
