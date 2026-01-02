"""Create automation rule tables."""

from backend.app.db.base import Base
from backend.app.db.session import engine
from backend.app.models.automation_rule import AutomationRule
from backend.app.models.rule_simulation import RuleSimulation


def upgrade():
    Base.metadata.create_all(
        bind=engine,
        tables=[AutomationRule.__table__, RuleSimulation.__table__],
        checkfirst=True,
    )


def downgrade():
    RuleSimulation.__table__.drop(bind=engine, checkfirst=True)
    AutomationRule.__table__.drop(bind=engine, checkfirst=True)


if __name__ == "__main__":
    upgrade()
