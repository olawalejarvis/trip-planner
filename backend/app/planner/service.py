"""Orchestrates a trip-plan query: finds walkable stops near the origin and
destination, runs RAPTOR, and turns the raw round-by-round results into a
small set of labeled, ranked itineraries.

Arrive-by is implemented as a binary search over depart-at times rather than
a separate backward RAPTOR: GTFS schedules are FIFO (a later departure never
arrives earlier), so "best arrival time reachable from depart_at=t" is
monotonic in t, which makes the latest-feasible-departure search correct and
keeps a single, well-tested forward algorithm instead of two.
"""

from sqlalchemy import cast, func, select
from sqlalchemy.orm import Session

from app.planner import raptor
from app.planner.graph import WALK_SPEED_MPS, get_graph
from geoalchemy2 import Geography
from app.models import Stop

MAX_WALK_M = 800
ARRIVE_BY_SEARCH_WINDOW_S = 3 * 3600
ARRIVE_BY_SEARCH_TOLERANCE_S = 60


def _nearby_stops(db: Session, feed_id: str, lat: float, lng: float, radius_m: float) -> dict[str, tuple[int, float]]:
    point = cast(func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326), Geography)
    distance = func.ST_Distance(Stop.geom, point)
    rows = db.execute(
        select(Stop.stop_id, distance)
        .where(Stop.feed_id == feed_id, func.ST_DWithin(Stop.geom, point, radius_m))
    ).all()
    return {stop_id: (max(1, round(dist_m / WALK_SPEED_MPS)), dist_m) for stop_id, dist_m in rows}


def _best_arrival(labels, max_rounds: int, destination_stops: dict[str, tuple[int, float]]) -> float:
    best = float("inf")
    for k in range(max_rounds + 1):
        for stop_id, (walk_s, _dist) in destination_stops.items():
            label = labels[k].get(stop_id)
            if label is not None:
                best = min(best, label.time + walk_s)
    return best


def _itineraries_from_labels(labels, max_rounds, destination_stops) -> list[dict]:
    """One candidate per round where the destination arrival improved -- the
    RAPTOR Pareto set trading off arrival time against transfer count."""
    candidates = []
    seen_leg_signatures = set()

    for k in range(max_rounds + 1):
        best_stop, best_time, best_walk = None, float("inf"), None
        for stop_id, (walk_s, dist_m) in destination_stops.items():
            label = labels[k].get(stop_id)
            if label is not None and label.time + walk_s < best_time:
                best_time = label.time + walk_s
                best_stop = stop_id
                best_walk = (walk_s, dist_m)

        if best_stop is None:
            continue

        legs = raptor.reconstruct(labels, k, best_stop)
        if not legs:
            continue
        if best_walk[0] > 0:
            legs.append(
                {
                    "kind": "walk",
                    "from_stop": best_stop,
                    "to_stop": None,
                    "distance_m": round(best_walk[1], 1),
                    "duration_s": best_walk[0],
                }
            )

        signature = tuple((leg.get("trip_id"), leg.get("board_stop"), leg.get("alight_stop")) for leg in legs)
        if signature in seen_leg_signatures:
            continue
        seen_leg_signatures.add(signature)

        total_walk_s = sum(leg["duration_s"] for leg in legs if leg["kind"] == "walk")
        num_transfers = max(0, sum(1 for leg in legs if leg["kind"] == "transit") - 1)

        candidates.append(
            {
                "arrival_time": best_time,
                "num_transfers": num_transfers,
                "total_walk_s": total_walk_s,
                "legs": legs,
            }
        )

    return candidates


def _label_candidates(candidates: list[dict], start_time: int) -> list[dict]:
    if not candidates:
        return []

    fastest = min(candidates, key=lambda c: c["arrival_time"])
    fewest_transfers = min(candidates, key=lambda c: (c["num_transfers"], c["arrival_time"]))
    least_walking = min(candidates, key=lambda c: (c["total_walk_s"], c["arrival_time"]))

    labeled: dict[int, set[str]] = {}
    for tag, chosen in (("fastest", fastest), ("fewest_transfers", fewest_transfers), ("least_walking", least_walking)):
        idx = candidates.index(chosen)
        labeled.setdefault(idx, set()).add(tag)

    results = []
    for idx in sorted(labeled, key=lambda i: candidates[i]["arrival_time"]):
        c = candidates[idx]
        results.append(
            {
                "labels": sorted(labeled[idx]),
                "depart_time": start_time,
                "arrival_time": c["arrival_time"],
                "duration_s": c["arrival_time"] - start_time,
                "num_transfers": c["num_transfers"],
                "total_walk_s": c["total_walk_s"],
                "legs": c["legs"],
            }
        )
    return results


def plan_depart_at(
    db: Session, feed_id: str, date: str, origin: tuple[float, float], destination: tuple[float, float], depart_at: int
) -> list[dict]:
    graph = get_graph(db, feed_id, date)
    origin_stops = _nearby_stops(db, feed_id, *origin, MAX_WALK_M)
    destination_stops = _nearby_stops(db, feed_id, *destination, MAX_WALK_M)
    if not origin_stops or not destination_stops:
        return []

    labels = raptor.run(graph, origin_stops, depart_at)
    candidates = _itineraries_from_labels(labels, raptor.MAX_ROUNDS, destination_stops)
    return _label_candidates(candidates, depart_at)


def plan_arrive_by(
    db: Session, feed_id: str, date: str, origin: tuple[float, float], destination: tuple[float, float], arrive_by: int
) -> list[dict]:
    graph = get_graph(db, feed_id, date)
    origin_stops = _nearby_stops(db, feed_id, *origin, MAX_WALK_M)
    destination_stops = _nearby_stops(db, feed_id, *destination, MAX_WALK_M)
    if not origin_stops or not destination_stops:
        return []

    def feasible(depart_at: int) -> bool:
        labels = raptor.run(graph, origin_stops, depart_at)
        return _best_arrival(labels, raptor.MAX_ROUNDS, destination_stops) <= arrive_by

    lo = max(0, arrive_by - ARRIVE_BY_SEARCH_WINDOW_S)
    hi = arrive_by

    if not feasible(lo):
        return []

    while hi - lo > ARRIVE_BY_SEARCH_TOLERANCE_S:
        mid = (lo + hi) // 2
        if feasible(mid):
            lo = mid
        else:
            hi = mid

    labels = raptor.run(graph, origin_stops, lo)
    candidates = _itineraries_from_labels(labels, raptor.MAX_ROUNDS, destination_stops)
    return _label_candidates(candidates, lo)
