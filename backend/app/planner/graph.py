"""Builds an in-memory RAPTOR planning graph for one feed + service date.

Grouping trips into "patterns" (same route, same ordered stop sequence) and
sorting each pattern's trips by departure time is what lets the RAPTOR round
loop scan a route once per round instead of re-querying the database per
stop. Rebuilt lazily and cached per (feed_id, date) for the life of the
process -- fine at Metrobus's current scale (~1,900 trips/day) and cheap to
invalidate by restarting after a weekly GTFS re-import.
"""

from bisect import bisect_left
from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.gtfs_util import active_service_ids
from app.models import Stop, StopTime, Trip
from app.planner.geo import WALK_SPEED_MPS

TRANSFER_WALK_RADIUS_M = 250


@dataclass
class Pattern:
    pattern_id: str
    route_id: str
    stop_ids: tuple[str, ...]


@dataclass
class PatternTrip:
    trip_id: str
    headsign: str | None
    # Aligned to Pattern.stop_ids
    arrivals: tuple[int, ...]
    departures: tuple[int, ...]


@dataclass
class StopInfo:
    stop_id: str
    name: str
    lat: float
    lng: float


@dataclass
class PlanningGraph:
    feed_id: str
    date: str
    stops: dict[str, StopInfo] = field(default_factory=dict)
    patterns: dict[str, Pattern] = field(default_factory=dict)
    # pattern_id -> trips sorted by departure at stop_ids[0]
    pattern_trips: dict[str, list[PatternTrip]] = field(default_factory=dict)
    # stop_id -> list of (pattern_id, position_in_pattern)
    stop_patterns: dict[str, list[tuple[str, int]]] = field(default_factory=dict)
    # stop_id -> list of (other_stop_id, walk_seconds), same-stop pairs excluded
    footpaths: dict[str, list[tuple[str, int]]] = field(default_factory=dict)

    def earliest_trip(self, pattern_id: str, position: int, not_before: int) -> PatternTrip | None:
        trips = self.pattern_trips[pattern_id]
        deps_at_position = [t.departures[position] for t in trips]
        idx = bisect_left(deps_at_position, not_before)
        if idx == len(trips):
            return None
        return trips[idx]


_cache: dict[tuple[str, str], PlanningGraph] = {}


def get_graph(db: Session, feed_id: str, date: str) -> PlanningGraph:
    key = (feed_id, date)
    if key not in _cache:
        _cache[key] = _build_graph(db, feed_id, date)
    return _cache[key]


def _build_graph(db: Session, feed_id: str, date: str) -> PlanningGraph:
    graph = PlanningGraph(feed_id=feed_id, date=date)

    for s in db.execute(select(Stop).where(Stop.feed_id == feed_id)).scalars():
        graph.stops[s.stop_id] = StopInfo(s.stop_id, s.stop_name, s.stop_lat, s.stop_lon)

    service_ids = active_service_ids(db, feed_id, date)
    if not service_ids:
        return graph

    trip_rows = db.execute(
        select(Trip).where(Trip.feed_id == feed_id, Trip.service_id.in_(service_ids))
    ).scalars().all()
    trip_ids = [t.trip_id for t in trip_rows]
    trip_by_id = {t.trip_id: t for t in trip_rows}

    stop_time_rows = db.execute(
        select(StopTime)
        .where(StopTime.feed_id == feed_id, StopTime.trip_id.in_(trip_ids))
        .order_by(StopTime.trip_id, StopTime.stop_sequence)
    ).scalars().all()

    by_trip: dict[str, list[StopTime]] = {}
    for st in stop_time_rows:
        by_trip.setdefault(st.trip_id, []).append(st)

    pattern_by_key: dict[tuple[str, tuple[str, ...]], str] = {}

    for trip_id, sts in by_trip.items():
        trip = trip_by_id[trip_id]
        stop_ids = tuple(st.stop_id for st in sts)
        key = (trip.route_id, stop_ids)
        pattern_id = pattern_by_key.get(key)
        if pattern_id is None:
            pattern_id = f"{trip.route_id}:{len(pattern_by_key)}"
            pattern_by_key[key] = pattern_id
            graph.patterns[pattern_id] = Pattern(pattern_id, trip.route_id, stop_ids)
            graph.pattern_trips[pattern_id] = []
            for i, stop_id in enumerate(stop_ids):
                graph.stop_patterns.setdefault(stop_id, []).append((pattern_id, i))

        graph.pattern_trips[pattern_id].append(
            PatternTrip(
                trip_id=trip_id,
                headsign=trip.trip_headsign,
                arrivals=tuple(st.arrival_seconds for st in sts),
                departures=tuple(st.departure_seconds for st in sts),
            )
        )

    for trips in graph.pattern_trips.values():
        trips.sort(key=lambda t: t.departures[0])

    graph.footpaths = _build_footpaths(db, feed_id)
    return graph


def _build_footpaths(db: Session, feed_id: str) -> dict[str, list[tuple[str, int]]]:
    a = Stop.__table__.alias("a")
    b = Stop.__table__.alias("b")
    distance = func.ST_Distance(a.c.geom, b.c.geom)

    rows = db.execute(
        select(a.c.stop_id, b.c.stop_id, distance)
        .select_from(a.join(b, func.ST_DWithin(a.c.geom, b.c.geom, TRANSFER_WALK_RADIUS_M)))
        .where(a.c.feed_id == feed_id, b.c.feed_id == feed_id, a.c.stop_id != b.c.stop_id)
    ).all()

    footpaths: dict[str, list[tuple[str, int]]] = {}
    for from_stop, to_stop, dist_m in rows:
        walk_seconds = max(1, round(dist_m / WALK_SPEED_MPS))
        footpaths.setdefault(from_stop, []).append((to_stop, walk_seconds))
    return footpaths
