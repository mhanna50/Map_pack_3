from __future__ import annotations

from datetime import date

from backend.app.services.seasonal import SeasonalPlanner


def test_seasonal_planner_detects_holiday():
    planner = SeasonalPlanner()
    event = planner.event_trigger(target_date=date(2024, 12, 25))
    assert event is not None
    assert event["bucket"] == "offer"


def test_seasonal_planner_weather_trigger():
    planner = SeasonalPlanner()
    event = planner.event_trigger(weather_alert="Heat advisory in effect")
    assert event is not None
    assert event["bucket"] == "service_spotlight"
