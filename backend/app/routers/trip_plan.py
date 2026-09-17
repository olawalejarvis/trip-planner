from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.gtfs_util import NL_TZ
from app.planner import service

router = APIRouter(tags=["trip-plan"])


@router.get("/trip-plan")
def trip_plan(
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
    feed_id: str = "metrobus",
    date: str | None = Query(None, description="YYYYMMDD, defaults to today in America/St_Johns"),
    depart_at: int | None = Query(None, description="Seconds past local midnight to depart at or after"),
    arrive_by: int | None = Query(None, description="Seconds past local midnight to arrive by"),
    db: Session = Depends(get_db),
):
    if depart_at is not None and arrive_by is not None:
        raise HTTPException(status_code=400, detail="Provide either depart_at or arrive_by, not both")

    now_local = datetime.now(NL_TZ)
    date = date or now_local.strftime("%Y%m%d")

    if arrive_by is not None:
        itineraries = service.plan_arrive_by(
            db, feed_id, date, (from_lat, from_lng), (to_lat, to_lng), arrive_by
        )
    else:
        if depart_at is None:
            depart_at = now_local.hour * 3600 + now_local.minute * 60 + now_local.second
        itineraries = service.plan_depart_at(
            db, feed_id, date, (from_lat, from_lng), (to_lat, to_lng), depart_at
        )

    return {"date": date, "itineraries": itineraries}
