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

from app.planner import raptor, walking
from app.planner.geo import WALK_SPEED_MPS, haversine_m
from app.planner.graph import get_graph
from geoalchemy2 import Geography
from app.models import Stop

MAX_WALK_M = 800
MAX_DIRECT_WALK_M = 2000
ARRIVE_BY_SEARCH_WINDOW_S = 3 * 3600
ARRIVE_BY_SEARCH_TOLERANCE_S = 60
DEFAULT_MAX_OPTIONS = 4
NEXT_DEPARTURE_SEARCH_WINDOW_S = 2 * 3600


def _direct_walk_distance(origin: tuple[float, float], destination: tuple[float, float]) -> float | None:
    """None if too far to bother even checking -- straight-line distance is
    always <= the real walk, so if it already exceeds the cutoff the real
    distance can't be under it either, and it's not worth an OSRM call."""
    if haversine_m(*origin, *destination) > MAX_DIRECT_WALK_M:
        return None
    return walking.real_distance_m(origin, destination)


def _direct_walk_leg(distance_m: float | None) -> dict | None:
    """A same-stop RAPTOR round-0 label is always dominated by walking origin
    to destination directly (triangle inequality), so round 0 is excluded
    from candidates entirely and pure walking is instead offered explicitly,
    competing on equal footing with transit."""
    if distance_m is None or distance_m > MAX_DIRECT_WALK_M:
        return None
    duration_s = max(1, round(distance_m / WALK_SPEED_MPS))
    return {
        "arrival_time": None,  # filled in by the caller, which knows the start time
        "num_transfers": 0,
        "total_walk_s": duration_s,
        "legs": [{"kind": "walk", "from_stop": None, "to_stop": None, "distance_m": round(distance_m, 1), "duration_s": duration_s}],
    }


def _nearby_stops(db: Session, feed_id: str, lat: float, lng: float, radius_m: float) -> dict[str, tuple[int, float]]:
    """Real walking distance/time per candidate stop (see app.planner.walking),
    not straight-line -- confirmed straight-line can understate the real walk
    by 2x+, which both misled the shown distance/time and let a stop that only
    looked closer on paper out-rank a genuinely closer one."""
    point = cast(func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326), Geography)
    within = func.ST_DWithin(Stop.geom, point, radius_m)
    rows = db.execute(
        select(Stop.stop_id, Stop.stop_lat, Stop.stop_lon).where(Stop.feed_id == feed_id, within)
    ).all()
    if not rows:
        return {}

    stop_coords = {stop_id: (stop_lat, stop_lon) for stop_id, stop_lat, stop_lon in rows}
    real_distances = walking.real_distances_m((lat, lng), stop_coords)

    result: dict[str, tuple[int, float]] = {}
    for stop_id, dist_m in real_distances.items():
        if dist_m > radius_m:
            continue  # straight-line was within radius but the real walk isn't
        result[stop_id] = (max(1, round(dist_m / WALK_SPEED_MPS)), dist_m)
    return result


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

    # Round 0 = zero trips boarded (still just walking from the origin), so it
    # can never represent a transit-based arrival -- and by the triangle
    # inequality it's always dominated by walking origin to destination
    # directly, which is offered separately via _direct_walk_leg.
    for k in range(1, max_rounds + 1):
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


def _itinerary_signature(itinerary: dict) -> tuple:
    return tuple((leg.get("trip_id"), leg.get("board_time")) for leg in itinerary["legs"] if leg["kind"] == "transit")


def _first_board_time(itinerary: dict) -> int | None:
    for leg in itinerary["legs"]:
        if leg["kind"] == "transit":
            return leg["board_time"]
    return None


def _plan_depart_at_once(
    graph,
    origin_stops: dict[str, tuple[int, float]],
    destination_stops: dict[str, tuple[int, float]],
    direct_walk_distance: float | None,
    depart_at: int,
) -> list[dict]:
    candidates: list[dict] = []
    direct_walk = _direct_walk_leg(direct_walk_distance)
    if direct_walk:
        direct_walk["arrival_time"] = depart_at + direct_walk["total_walk_s"]
        candidates.append(direct_walk)

    if origin_stops and destination_stops:
        labels = raptor.run(graph, origin_stops, depart_at)
        candidates.extend(_itineraries_from_labels(labels, raptor.MAX_ROUNDS, destination_stops))

    return _label_candidates(candidates, depart_at)


def _plan_arrive_by_once(
    graph,
    origin_stops: dict[str, tuple[int, float]],
    destination_stops: dict[str, tuple[int, float]],
    direct_walk_distance: float | None,
    arrive_by: int,
    depart_upper_bound: int | None = None,
) -> list[dict]:
    direct_walk_s = max(1, round(direct_walk_distance / WALK_SPEED_MPS)) if direct_walk_distance is not None else None
    has_transit_option = bool(origin_stops and destination_stops)

    def feasible(depart_at: int) -> bool:
        if direct_walk_s is not None and depart_at + direct_walk_s <= arrive_by:
            return True
        if not has_transit_option:
            return False
        labels = raptor.run(graph, origin_stops, depart_at)
        return _best_arrival(labels, raptor.MAX_ROUNDS, destination_stops) <= arrive_by

    hi = depart_upper_bound if depart_upper_bound is not None else arrive_by
    lo = max(0, hi - ARRIVE_BY_SEARCH_WINDOW_S)

    if not feasible(lo):
        return []

    while hi - lo > ARRIVE_BY_SEARCH_TOLERANCE_S:
        mid = (lo + hi) // 2
        if feasible(mid):
            lo = mid
        else:
            hi = mid

    candidates: list[dict] = []
    direct_walk = _direct_walk_leg(direct_walk_distance)
    if direct_walk and lo + direct_walk["total_walk_s"] <= arrive_by:
        direct_walk["arrival_time"] = lo + direct_walk["total_walk_s"]
        candidates.append(direct_walk)
    if has_transit_option:
        labels = raptor.run(graph, origin_stops, lo)
        candidates.extend(_itineraries_from_labels(labels, raptor.MAX_ROUNDS, destination_stops))

    return _label_candidates(candidates, lo)


def plan_depart_at(
    db: Session,
    feed_id: str,
    date: str,
    origin: tuple[float, float],
    destination: tuple[float, float],
    depart_at: int,
    max_options: int = DEFAULT_MAX_OPTIONS,
) -> list[dict]:
    """Repeats the single-instant search at successively later departure
    times so the result reads like "next few buses", not just one snapshot."""
    graph = get_graph(db, feed_id, date)
    origin_stops = _nearby_stops(db, feed_id, *origin, MAX_WALK_M)
    destination_stops = _nearby_stops(db, feed_id, *destination, MAX_WALK_M)
    direct_walk_distance = _direct_walk_distance(origin, destination)

    results: list[dict] = []
    seen: set[tuple] = set()
    current_depart = depart_at
    end_time = depart_at + NEXT_DEPARTURE_SEARCH_WINDOW_S

    while len(results) < max_options and current_depart <= end_time:
        batch = _plan_depart_at_once(graph, origin_stops, destination_stops, direct_walk_distance, current_depart)
        if not batch:
            break

        for itinerary in batch:
            sig = _itinerary_signature(itinerary)
            if sig not in seen:
                seen.add(sig)
                results.append(itinerary)

        earliest = min(batch, key=lambda i: i["arrival_time"])
        next_board = _first_board_time(earliest)
        if next_board is None or next_board < current_depart:
            break
        current_depart = next_board + 1

    results.sort(key=lambda i: i["arrival_time"])
    return results[:max_options]


def plan_arrive_by(
    db: Session,
    feed_id: str,
    date: str,
    origin: tuple[float, float],
    destination: tuple[float, float],
    arrive_by: int,
    max_options: int = DEFAULT_MAX_OPTIONS,
) -> list[dict]:
    """Repeats the latest-feasible-departure search with progressively
    earlier upper bounds, surfacing a few alternatives that all still make
    the arrive-by target, not just the single latest departure."""
    graph = get_graph(db, feed_id, date)
    origin_stops = _nearby_stops(db, feed_id, *origin, MAX_WALK_M)
    destination_stops = _nearby_stops(db, feed_id, *destination, MAX_WALK_M)
    direct_walk_distance = _direct_walk_distance(origin, destination)

    results: list[dict] = []
    seen: set[tuple] = set()
    upper_bound = arrive_by

    for _ in range(max_options):
        batch = _plan_arrive_by_once(
            graph, origin_stops, destination_stops, direct_walk_distance, arrive_by, depart_upper_bound=upper_bound
        )
        if not batch:
            break

        found_new = False
        for itinerary in batch:
            sig = _itinerary_signature(itinerary)
            if sig not in seen:
                seen.add(sig)
                results.append(itinerary)
                found_new = True
        if not found_new:
            break

        earliest_depart = min(i["depart_time"] for i in batch)
        if earliest_depart - 60 >= upper_bound:
            break
        upper_bound = earliest_depart - 60

    results.sort(key=lambda i: i["arrival_time"])
    return results[:max_options]
