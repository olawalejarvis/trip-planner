from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Calendar, CalendarDate

NL_TZ = ZoneInfo("America/St_Johns")
WEEKDAY_FIELDS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def active_service_ids(db: Session, feed_id: str, date: str) -> set[str]:
    """date is YYYYMMDD. Applies calendar.txt weekday pattern then calendar_dates.txt exceptions."""
    weekday_index = datetime.strptime(date, "%Y%m%d").weekday()  # Monday=0
    weekday_field = WEEKDAY_FIELDS[weekday_index]

    calendars = db.execute(
        select(Calendar).where(
            Calendar.feed_id == feed_id,
            Calendar.start_date <= date,
            Calendar.end_date >= date,
            getattr(Calendar, weekday_field).is_(True),
        )
    ).scalars().all()
    service_ids = {c.service_id for c in calendars}

    exceptions = db.execute(
        select(CalendarDate).where(CalendarDate.feed_id == feed_id, CalendarDate.date == date)
    ).scalars().all()
    for ex in exceptions:
        if ex.exception_type == 1:
            service_ids.add(ex.service_id)
        elif ex.exception_type == 2:
            service_ids.discard(ex.service_id)

    return service_ids
