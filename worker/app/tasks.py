from app.celery_app import celery_app

@celery_app.task
def ping():
    return {"ok": True}
