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
    GOOGLE_ACCOUNT_MANAGEMENT_API_BASE_URL: AnyHttpUrl = cast(
        AnyHttpUrl, "https://mybusinessaccountmanagement.googleapis.com/v1"
    )
    GOOGLE_BUSINESS_API_BASE_URL: AnyHttpUrl = cast(
        AnyHttpUrl, "https://mybusinessbusinessinformation.googleapis.com/v1"
    )
    GOOGLE_ADS_DEVELOPER_TOKEN: str = ""
    GOOGLE_ADS_CLIENT_ID: str = ""
    GOOGLE_ADS_CLIENT_SECRET: str = ""
    GOOGLE_ADS_REFRESH_TOKEN: str = ""
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: str = ""
    GOOGLE_ADS_CUSTOMER_ID: str = ""
    GOOGLE_ADS_LANGUAGE_ID: str = "1000"  # English
    GOOGLE_ADS_GEO_TARGET_IDS: str = ""
    GOOGLE_ADS_API_VERSION: str = "v22"
    REQUIRE_GOOGLE_KEYWORD_PLANNER: bool = False

    OPENAI_API_KEY: str = ""
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM_NUMBER: str = ""
    TWILIO_MESSAGING_SERVICE_SID: str = ""
    TWILIO_DEFAULT_FROM_NUMBER: str = ""
    ALLOW_UNSIGNED_TWILIO_WEBHOOKS: bool = False
    LEAD_RECOVERY_ENABLED: bool = True

    SUPABASE_URL: str = ""
    SUPABASE_JWKS_URL: str = ""
    SUPABASE_JWT_ISSUER: str = ""
    SUPABASE_JWT_AUDIENCE: str = "authenticated"
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_JWT_SECRET: str = ""

    STRIPE_SECRET_KEY: str = ""
    STRIPE_API_VERSION: str = "2026-02-25.clover"
    STRIPE_PRICE_ID: str = ""
    STRIPE_PRICE_ID_STARTER: str = ""
    STRIPE_PRICE_ID_PRO: str = ""
    STRIPE_PRICE_ID_AGENCY: str = ""
    STRIPE_PRICE_ID_FRIENDS_FAMILY: str = ""
    STRIPE_PRICE_ID_STANDARD: str = ""
    STRIPE_PRICE_ID_GROWTH_ADDON: str = ""
    STRIPE_PRICE_ID_AUTHORITY_ADDON: str = ""
    STRIPE_PRICE_AMOUNT_STARTER: int | None = None
    STRIPE_PRICE_AMOUNT_PRO: int | None = None
    STRIPE_PRICE_AMOUNT_AGENCY: int | None = None
    STRIPE_PRICE_AMOUNT_FRIENDS_FAMILY: int | None = None
    STRIPE_PRICE_AMOUNT_STANDARD: int | None = None
    STRIPE_PRICE_AMOUNT_GROWTH_ADDON: int | None = None
    STRIPE_PRICE_AMOUNT_AUTHORITY_ADDON: int | None = None
    STRIPE_PRICE_AMOUNT: int | None = None
    STRIPE_PRICE_CURRENCY: str = "usd"
    STRIPE_PRICE_INTERVAL: str = "month"
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_SUCCESS_URL: AnyHttpUrl | None = None
    STRIPE_CANCEL_URL: AnyHttpUrl | None = None

    CLIENT_APP_URL: AnyHttpUrl = cast(AnyHttpUrl, "http://localhost:3000")

    ACTION_DISPATCH_BATCH_SIZE: int = 50
    ACTION_MAX_ATTEMPTS: int = 5
    ACTION_BASE_BACKOFF_SECONDS: int = 30
    ACTION_MAX_BACKOFF_SECONDS: int = 60 * 60
    GLOBAL_POSTING_PAUSE: bool = False
    DRY_RUN_MODE: bool = False
    SHADOW_MODE: bool = False
    RATE_LIMIT_PER_HOUR: int = 200
    ALERT_SMS_RECIPIENTS: str = ""  # comma-separated E.164 numbers
    KEYWORD_POSTS_PER_MONTH: int = 30
    KEYWORDS_PER_SERVICE_MIN: int = 2
    KEYWORDS_PER_SERVICE_MAX: int = 3
    KEYWORD_RETAIN_PERFORMANCE_THRESHOLD: float = 55.0
    PROFILE_DESCRIPTION_REFRESH_DAYS: int = 90


settings = Settings()
