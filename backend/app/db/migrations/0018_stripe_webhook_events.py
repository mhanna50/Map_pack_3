"""Add Stripe webhook event ledger for idempotency."""

from backend.app.db.session import engine
from backend.app.models.billing.stripe_webhook_event import StripeWebhookEvent


revision = "0018_stripe_webhook_events"
down_revision = "0017_backend_enum_label_compat"
branch_labels = None
depends_on = None


def upgrade():
    StripeWebhookEvent.__table__.create(bind=engine, checkfirst=True)


def downgrade():
    StripeWebhookEvent.__table__.drop(bind=engine, checkfirst=True)


if __name__ == "__main__":
    upgrade()
