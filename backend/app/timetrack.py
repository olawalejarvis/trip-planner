"""Client for Metrobus's live TimeTrack vehicle-position endpoint.

This endpoint (https://www.metrobus.co.ca/api/timetrack/json/) is not an
officially documented developer API -- it was found via a third-party
tracker and verified working directly (see DISCOVERY.md). It has no CORS
header, so it must be called server-side, never straight from the mobile
app. Short-TTL cached here since the source has historically refreshed
roughly every 90 seconds.
"""

import time

import httpx

from app.config import settings

_cache: dict = {"fetched_at": 0.0, "vehicles": []}


def get_vehicles() -> list[dict]:
    now = time.monotonic()
    if now - _cache["fetched_at"] < settings.timetrack_cache_ttl_seconds:
        return _cache["vehicles"]

    resp = httpx.get(settings.timetrack_url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
    resp.raise_for_status()
    vehicles = resp.json()

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
