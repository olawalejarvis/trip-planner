from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, cast, func, select
from sqlalchemy.orm import Session

from app import timetrack
from app.database import get_db
from app.gtfs_util import NL_TZ, active_service_ids
from app.models import Route, Stop, StopTime, Trip
from geoalchemy2 import Geography

router = APIRouter(tags=["stops"])


def serialize_stop(s: Stop) -> dict:
    return {
        "feed_id": s.feed_id,
        "stop_id": s.stop_id,
        "code": s.stop_code,
        "name": s.stop_name,
        "lat": s.stop_lat,
        "lng": s.stop_lon,
        "wheelchair_boarding": s.wheelchair_boarding,
    }


@router.get("/stops")
def list_stops(feed_id: str = "metrobus", db: Session = Depends(get_db)):
    rows = db.execute(select(Stop).where(Stop.feed_id == feed_id)).scalars().all()
    return [serialize_stop(s) for s in rows]


@router.get("/stops/nearby")
def nearby_stops(
    lat: float,
    lng: float,
    radius_m: float = 500,
    limit: int = 20,
    feed_id: str | None = None,
    db: Session = Depends(get_db),
):
    point = cast(func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326), Geography)
    distance = func.ST_Distance(Stop.geom, point)

    query = select(Stop, distance.label("distance_m")).where(func.ST_DWithin(Stop.geom, point, radius_m))
    if feed_id:
        query = query.where(Stop.feed_id == feed_id)
    query = query.order_by(distance).limit(limit)

    rows = db.execute(query).all()
    return [{**serialize_stop(s), "distance_m": round(dist, 1)} for s, dist in rows]


@router.get("/stops/search")
def search_stops(q: str, feed_id: str = "metrobus", limit: int = 10, db: Session = Depends(get_db)):
    if len(q.strip()) < 2:
        return []
    starts_with = Stop.stop_name.ilike(f"{q}%")
    rows = db.execute(
        select(Stop)
        .where(Stop.feed_id == feed_id, Stop.stop_name.ilike(f"%{q}%"))
        .order_by(case((starts_with, 0), else_=1), Stop.stop_name)
        .limit(limit)
    ).scalars().all()
    return [serialize_stop(s) for s in rows]


@router.get("/stops/{stop_id}")
def get_stop(stop_id: str, feed_id: str = "metrobus", db: Session = Depends(get_db)):
    stop = db.get(Stop, {"feed_id": feed_id, "stop_id": stop_id})
    if not stop:
        raise HTTPException(status_code=404, detail="Stop not found")
    return serialize_stop(stop)


@router.get("/stops/{stop_id}/departures")
def stop_departures(
    stop_id: str,
    feed_id: str = "metrobus",
    date: str | None = Query(None, description="YYYYMMDD, defaults to today in America/St_Johns"),
    after_seconds: int | None = Query(None, description="Seconds past local midnight, defaults to now"),
    limit: int = 10,
    db: Session = Depends(get_db),
):
    now_local = datetime.now(NL_TZ)
    date = date or now_local.strftime("%Y%m%d")
    if after_seconds is None:
        after_seconds = now_local.hour * 3600 + now_local.minute * 60 + now_local.second

    service_ids = active_service_ids(db, feed_id, date)
    if not service_ids:
        return []

    rows = db.execute(
        select(StopTime, Trip, Route)
        .join(Trip, (Trip.feed_id == StopTime.feed_id) & (Trip.trip_id == StopTime.trip_id))
        .join(Route, (Route.feed_id == Trip.feed_id) & (Route.route_id == Trip.route_id))
        .where(
            StopTime.feed_id == feed_id,
            StopTime.stop_id == stop_id,
            Trip.service_id.in_(service_ids),
            StopTime.departure_seconds >= after_seconds,
        )
        .order_by(StopTime.departure_seconds)
        .limit(limit)
    ).all()

    results = []
    for st, trip, route in rows:
        vehicle = timetrack.vehicle_for_trip(trip.trip_id)
        results.append(
            {
                "route_id": route.route_id,
                "route_short_name": route.route_short_name,
                "trip_headsign": trip.trip_headsign,
                "scheduled_departure": st.departure_time,
                "realtime": vehicle is not None,
                "vehicle": (
                    {
                        "vehicle_id": vehicle.get("vehicle"),
                        "deviation": vehicle.get("deviation"),
                        "sched_difference_mins": vehicle.get("gtfs_stop_sequence_sched_difference_mins"),
                        "current_location": vehicle.get("current_location"),
                    }
                    if vehicle
                    else None
                ),
            }
        )
    return results
