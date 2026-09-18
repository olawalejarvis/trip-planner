"""Fills in large gaps in a GTFS shape's point sequence by snapping to the
real road network via OSRM's driving profile, instead of leaving a
straight-line cord across the gap.

Confirmed some Metrobus shapes have 100-260m gaps between consecutive points
in curvy areas (e.g. around the MUN campus loop on route 16's shape), which
draws a visible straight line cutting through non-road space. Cached per
shape_id -- many trips share one shape_id -- since this is computed whenever
a trip's shape is requested, not just once at GTFS import time.
"""

from concurrent.futures import ThreadPoolExecutor

import httpx

from app.planner.geo import haversine_m

OSRM_ROUTE_URL = "https://router.project-osrm.org/route/v1/driving"
GAP_THRESHOLD_M = 60
MAX_CONCURRENT_REQUESTS = 10
# Car routing sometimes can't find a direct path where the bus can (a
# bus-only lane, a campus road closed to general traffic) and detours wildly
# instead -- confirmed ratios up to 31x the straight-line gap on one shape,
# which spliced a large, unrelated loop into the route line. A real curve
# fill stays close to the straight-line distance (observed ~1.0-1.2x); this
# rejects anything far outside that and falls back to the straight line for
# just that one gap.
MAX_ROUTE_RATIO = 2.0

_cache: dict[str, list[tuple[float, float]]] = {}


def densify(shape_id: str, points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """points: (lat, lng) in order. Any consecutive pair farther apart than
    GAP_THRESHOLD_M is replaced by a real driving route between them.

    A shape can have dozens of such gaps (Metrobus's own shape data is sparse
    throughout large stretches, not just at sharp curves), so gap-fills run
    concurrently -- this only runs once per shape_id, ever, since the result
    is cached indefinitely afterward."""
    if shape_id in _cache:
        return _cache[shape_id]
    if len(points) < 2:
        _cache[shape_id] = points
        return points

    gap_indices = [i for i in range(len(points) - 1) if haversine_m(*points[i], *points[i + 1]) > GAP_THRESHOLD_M]

    with ThreadPoolExecutor(max_workers=MAX_CONCURRENT_REQUESTS) as pool:
        filled_by_index = dict(zip(gap_indices, pool.map(lambda i: _road_route(points[i], points[i + 1]), gap_indices)))

    result = [points[0]]
    for i, b in enumerate(points[1:]):
        filled = filled_by_index.get(i)
        result.extend(filled[1:] if filled else [b])  # filled[0] duplicates result[-1]

    _cache[shape_id] = result
    return result


def _road_route(a: tuple[float, float], b: tuple[float, float]) -> list[tuple[float, float]]:
    straight = haversine_m(*a, *b)
    lat1, lng1 = a
    lat2, lng2 = b
    url = f"{OSRM_ROUTE_URL}/{lng1},{lat1};{lng2},{lat2}?overview=full&geometries=geojson"
    try:
        resp = httpx.get(url, timeout=5)
        resp.raise_for_status()
        route = resp.json()["routes"][0]
        if route["distance"] > straight * MAX_ROUTE_RATIO:
            return [a, b]
        coords = route["geometry"]["coordinates"]
        return [(lat, lng) for lng, lat in coords]
    except Exception:
        return [a, b]
