"""Client for Metrobus's live TimeTrack vehicle-position endpoint.

This endpoint (https://www.metrobus.co.ca/api/timetrack/json/) is not an
officially documented developer API -- it was found via a third-party
tracker and verified working directly (see DISCOVERY.md). It has no CORS
header, so it must be called server-side, never straight from the mobile
app. Short-TTL cached here since the source has historically refreshed
roughly every 90 seconds.
"""

import time
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

from app.config import settings

NL_TZ = ZoneInfo("America/St_Johns")

_cache: dict = {"fetched_at": 0.0, "vehicles": []}


def _is_current(vehicle: dict, now_nl: datetime) -> bool:
    """TimeTrack has no concept of "no vehicles right now" -- once a bus goes
    out of service it just keeps reporting its last known position (verified
    by curling it at 11:54pm NL time and seeing every vehicle still "at" its
    ~6:30am position). Without this filter the map shows buses frozen in
    place for hours instead of an empty, no-service map."""
    seconds = vehicle.get("position_time_seconds")
    if seconds is None:
        return False
    now_seconds = now_nl.hour * 3600 + now_nl.minute * 60 + now_nl.second
    diff = (now_seconds - seconds) % 86400
    diff = min(diff, 86400 - diff)
    return diff <= settings.timetrack_stale_after_seconds


def get_vehicles() -> list[dict]:
    now = time.monotonic()
    if now - _cache["fetched_at"] < settings.timetrack_cache_ttl_seconds:
        return _cache["vehicles"]

    resp = httpx.get(settings.timetrack_url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
    resp.raise_for_status()
    vehicles = [v for v in resp.json() if _is_current(v, datetime.now(NL_TZ))]

    _cache["fetched_at"] = now
    _cache["vehicles"] = vehicles
    return vehicles


def vehicles_for_route(route_number: int) -> list[dict]:
    return [v for v in get_vehicles() if v.get("routenumber") == route_number]


def vehicle_for_trip(gtfs_trip_id: str) -> dict | None:
    for v in get_vehicles():
        if v.get("gtfs_trip_id") == gtfs_trip_id:
            return v
    return None
