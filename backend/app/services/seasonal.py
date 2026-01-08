from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

SEASONAL_BUCKETS = {
    1: "seasonal_tip",
    2: "seasonal_tip",
    3: "seasonal_tip",
    4: "seasonal_tip",
    5: "service_spotlight",
    6: "service_spotlight",
    7: "proof",
    8: "proof",
    9: "seasonal_tip",
    10: "seasonal_tip",
    11: "offer",
    12: "offer",
}

CATEGORY_OVERRIDES = {
    "hvac": {
        11: "service_spotlight",
        12: "service_spotlight",
        1: "seasonal_tip",
        2: "seasonal_tip",
    },
    "landscaping": {
        3: "service_spotlight",
        4: "service_spotlight",
        6: "proof",
    },
}

HOLIDAY_EVENTS = [
    {"month": 1, "day": 1, "name": "New Year's", "bucket": "offer", "boost": 12},
    {"month": 7, "day": 4, "name": "Independence Day", "bucket": "local_highlight", "boost": 10},
    {"month": 10, "day": 31, "name": "Halloween", "bucket": "local_highlight", "boost": 8},
    {"month": 12, "day": 25, "name": "Holiday Season", "bucket": "offer", "boost": 12},
    {"month": 11, "weekday": 3, "occurrence": 4, "name": "Thanksgiving", "bucket": "proof", "boost": 10},
}

WEATHER_TRIGGERS = {
    "storm": {"name": "Storm Alert", "bucket": "seasonal_tip", "message": "Share preparation tips."},
    "heat": {"name": "Heatwave", "bucket": "service_spotlight", "message": "Promote cooling services."},
}


class SeasonalPlanner:
    def pick_bucket(self, *, month: int | None = None, category: str | None = None) -> str | None:
        month = month or datetime.utcnow().month
        if category:
            override = CATEGORY_OVERRIDES.get(category.lower())
            if override and month in override:
                return override[month]
        return SEASONAL_BUCKETS.get(month)

    def event_trigger(
        self,
        *,
        target_date: date | None = None,
        timezone_name: str | None = None,
        weather_alert: str | None = None,
    ) -> dict | None:
        base_date = target_date or self._today(timezone_name)
        if weather_alert:
            alert = self._weather_trigger(weather_alert)
            if alert:
                return alert
        for event in HOLIDAY_EVENTS:
            event_date = self._event_date(event, base_date.year)
            if not event_date:
                continue
            delta = (event_date - base_date).days
            if -2 <= delta <= event.get("lead_days", 5):
                return {
                    "name": event["name"],
                    "bucket": event["bucket"],
                    "boost": event.get("boost", 10),
                    "date": event_date.isoformat(),
                }
        return None

    def seasonal_context(
        self,
        city: str | None = None,
        *,
        category: str | None = None,
        target_date: date | None = None,
    ) -> str:
        bucket = self.pick_bucket(month=target_date.month if target_date else None, category=category)
        phrases = {
            "seasonal_tip": "Share a timely seasonal maintenance insight",
            "offer": "Highlight a limited-time offer for the season",
            "service_spotlight": "Spotlight a high-demand service this month",
            "proof": "Showcase proof of results suited for this time of year",
            "local_highlight": "Mention a local community moment",
        }
        base = phrases.get(bucket, "Share a helpful update")
        event = self.event_trigger(target_date=target_date)
        if event:
            base = f"{base} with {event['name']} in mind"
        if city:
            return f"{base} for customers in {city}."
        return base + "."

    @staticmethod
    def _event_date(event: dict, year: int) -> date | None:
        if "day" in event:
            return date(year, event["month"], event["day"])
        weekday = event.get("weekday")
        occurrence = event.get("occurrence")
        if weekday is None or occurrence is None:
            return None
        current = date(year, event["month"], 1)
        hits = 0
        while current.month == event["month"]:
            if current.weekday() == weekday:
                hits += 1
                if hits == occurrence:
                    return current
            current += timedelta(days=1)
        return None

    @staticmethod
    def _today(timezone_name: str | None) -> date:
        if timezone_name:
            try:
                return datetime.now(ZoneInfo(timezone_name)).date()
            except Exception:  # noqa: BLE001
                pass
        return datetime.utcnow().date()

    @staticmethod
    def _weather_trigger(alert: str) -> dict | None:
        lowered = alert.lower()
        for keyword, payload in WEATHER_TRIGGERS.items():
            if keyword in lowered:
                return {
                    "name": payload["name"],
                    "bucket": payload["bucket"],
                    "boost": 12,
                    "message": payload["message"],
                }
        return None
