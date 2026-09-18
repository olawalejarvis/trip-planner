"""Leaf geometry utilities shared by the planning graph and the trip planner
-- no other app.planner imports, so both graph.py and walking.py can depend
on this without a cycle."""

from math import atan2, cos, radians, sin, sqrt

EARTH_RADIUS_M = 6371000
WALK_SPEED_MPS = 1.4


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = radians(lat1), radians(lat2)
    dphi = radians(lat2 - lat1)
    dlambda = radians(lng2 - lng1)
    a = sin(dphi / 2) ** 2 + cos(p1) * cos(p2) * sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_M * atan2(sqrt(a), sqrt(1 - a))
