"""Real (street-network) walking distances via OSRM, in place of the
straight-line haversine estimate used everywhere else in the planner.

Confirmed straight-line distance can understate real walking distance by 2x+
around blocked paths (rivers, campus layouts, one-way road grids) -- e.g. a
stop 650m from a destination in a straight line was actually a 1152m real
walk. This doesn't just mislead the displayed distance/time: since candidate
stops are ranked by this same walk cost, it can make a farther stop look
"closer" than a genuinely nearer one, hiding otherwise-good route options.

Uses OSRM's Table service (one request covers many destinations) rather than
one /route call per stop -- a trip-plan request can have ~20 candidate stops
per side, and this hits a shared public OSRM demo instance not meant for
heavy traffic (see mobile/src/api/directions.ts). Falls back to haversine,
per stop, if OSRM is slow/unreachable/malformed, rather than failing the
whole trip-plan request.
"""

import httpx

from app.planner.geo import haversine_m

OSRM_TABLE_URL = "https://router.project-osrm.org/table/v1/foot"

_cache: dict[tuple, float] = {}


def _cache_key(lat: float, lng: float, stop_id: str) -> tuple:
    return (round(lat, 5), round(lng, 5), stop_id)


def real_distances_m(point: tuple[float, float], stops: dict[str, tuple[float, float]]) -> dict[str, float]:
    """stops: stop_id -> (lat, lng). Returns stop_id -> real walking distance
    in meters, one OSRM Table call for every stop not already cached."""
    lat, lng = point
    fallback = {sid: haversine_m(lat, lng, slat, slng) for sid, (slat, slng) in stops.items()}
    if not stops:
        return fallback

    missing = {sid: coords for sid, coords in stops.items() if _cache_key(lat, lng, sid) not in _cache}
    if missing:
        ids = list(missing)
        coords_str = ";".join([f"{lng},{lat}"] + [f"{slng},{slat}" for slat, slng in missing.values()])
        destinations = ";".join(str(i + 1) for i in range(len(ids)))
        url = f"{OSRM_TABLE_URL}/{coords_str}?sources=0&destinations={destinations}&annotations=distance"
        try:
            resp = httpx.get(url, timeout=5)
            resp.raise_for_status()
            distances = resp.json()["distances"][0]
            for sid, dist in zip(ids, distances):
                _cache[_cache_key(lat, lng, sid)] = dist if dist is not None else fallback[sid]
        except Exception:
            for sid in ids:
                _cache[_cache_key(lat, lng, sid)] = fallback[sid]

    return {sid: _cache[_cache_key(lat, lng, sid)] for sid in stops}


def real_distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Single-pair convenience wrapper around real_distances_m."""
    return real_distances_m(a, {"_point": b})["_point"]
