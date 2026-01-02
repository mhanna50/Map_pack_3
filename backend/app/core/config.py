from typing import cast

from pydantic import AnyHttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/map_pack"
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"

    ENCRYPTION_KEY: str = ""

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_OAUTH_REDIRECT_URI: AnyHttpUrl | None = None
    GOOGLE_BUSINESS_API_BASE_URL: AnyHttpUrl = cast(
        AnyHttpUrl, "https://mybusinessbusinessinformation.googleapis.com/v1"
    )

    OPENAI_API_KEY: str = ""
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM_NUMBER: str = ""
    SENDGRID_API_KEY: str = ""
    EMAIL_FROM: str = ""
    POSTMARK_SERVER_TOKEN: str = ""

    ACTION_DISPATCH_BATCH_SIZE: int = 50
    ACTION_MAX_ATTEMPTS: int = 5
    ACTION_BASE_BACKOFF_SECONDS: int = 30
    ACTION_MAX_BACKOFF_SECONDS: int = 60 * 60


settings = Settings()
