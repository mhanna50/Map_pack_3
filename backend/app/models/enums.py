from enum import Enum


class OrganizationType(str, Enum):
    AGENCY = "agency"
    BUSINESS = "business"


class MembershipRole(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"


class ProviderType(str, Enum):
    GOOGLE_BUSINESS = "google_business"


class LocationStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    DISCONNECTED = "disconnected"


class ActionStatus(str, Enum):
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    DEAD_LETTERED = "dead_lettered"
    CANCELLED = "cancelled"


class ActionType(str, Enum):
    PUBLISH_GBP_POST = "publish_gbp_post"
    PUBLISH_QA = "publish_qna"
    CHECK_RANKINGS = "check_rankings"
    REQUEST_MEDIA_UPLOAD = "request_media_upload"
    MONITOR_COMPETITORS = "monitor_competitors"
    RUN_AUTOMATION_RULES = "run_automation_rules"
    REFRESH_GOOGLE_TOKEN = "refresh_google_token"
    SYNC_GOOGLE_LOCATIONS = "sync_google_locations"
    SYNC_GBP_REVIEWS = "sync_gbp_reviews"
    SYNC_GBP_POSTS = "sync_gbp_posts"
    COMPUTE_DAILY_SIGNALS = "compute_daily_signals"
    GENERATE_POST_CANDIDATES = "generate_post_candidates"
    COMPOSE_POST_CANDIDATE = "compose_post_candidate"
    SCHEDULE_POST = "schedule_post"
    CUSTOM = "custom"


class PostType(str, Enum):
    UPDATE = "update"
    OFFER = "offer"
    EVENT = "event"


class PostStatus(str, Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    QUEUED = "queued"
    PUBLISHED = "published"
    FAILED = "failed"
    CANCELLED = "cancelled"


class MediaType(str, Enum):
    IMAGE = "image"
    VIDEO = "video"
    DOCUMENT = "document"


class ReviewRating(str, Enum):
    ONE = "1"
    TWO = "2"
    THREE = "3"
    FOUR = "4"
    FIVE = "5"


class ReviewStatus(str, Enum):
    NEW = "new"
    AUTO_REPLIED = "auto_replied"
    NEEDS_APPROVAL = "needs_approval"
    APPROVED = "approved"
    REPLIED = "replied"
    FLAGGED = "flagged"


class ReviewRequestStatus(str, Enum):
    PENDING = "pending"
    SENT = "sent"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class QnaStatus(str, Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    NEEDS_REFRESH = "needs_refresh"
    ARCHIVED = "archived"


class GeoGridShape(str, Enum):
    SQUARE = "square"
    CIRCLE = "circle"


class PendingChangeStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class PendingChangeType(str, Enum):
    SERVICE = "service"
    ATTRIBUTE = "attribute"
    DESCRIPTION = "description"


class MediaStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"


class CompetitorSource(str, Enum):
    MANUAL = "manual"
    AUTO = "auto"


class ApprovalCategory(str, Enum):
    REVIEW_REPLY = "review_reply"
    GBP_EDIT = "gbp_edit"
    AI_CONTENT = "ai_content"


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    ROLLED_BACK = "rolled_back"


class AutomationTriggerType(str, Enum):
    INACTIVITY = "inactivity"
    RANK_DROP = "rank_drop"
    NEGATIVE_REVIEW = "negative_review"
    MISSING_SERVICE = "missing_service"
    PHOTO_STALENESS = "photo_staleness"


class AutomationCondition(str, Enum):
    ALWAYS = "always"
    MATCH = "match"


class AutomationActionType(str, Enum):
    CREATE_POST = "create_post"
    REQUEST_PHOTOS = "request_photos"
    REQUEST_REVIEW = "request_review"
    ACCEPT_REVIEW_REPLY = "accept_review_reply"


class AlertSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class AlertStatus(str, Enum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"


class GbpConnectionStatus(str, Enum):
    CONNECTED = "connected"
    EXPIRED = "expired"
    DISCONNECTED = "disconnected"
