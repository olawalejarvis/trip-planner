"""RAPTOR (round-based public transit routing) over a PlanningGraph.

Round k = "reachable using at most k trips" (so k-1 transfers). Running
several rounds and keeping each round's best arrival at the destination
gives a small Pareto set trading off arrival time against transfer count --
exactly the "fastest / fewest transfers / least walking" alternatives the
product wants, without a full multi-criteria label-setting search.

Reference: Delling, Pajor, Werneck, "Round-Based Public Transit Routing".
"""

from dataclasses import dataclass

from app.planner.graph import WALK_SPEED_MPS, PlanningGraph

INF = float("inf")
MAX_ROUNDS = 4  # up to 3 transfers
MIN_TRANSFER_S = 90  # buffer so a boarding isn't reachable the instant a rider alights


@dataclass
class WalkLeg:
    kind: str
    from_stop: str | None  # None means "origin point"
    to_stop: str | None  # None means "destination point"
    distance_m: float
    duration_s: int


@dataclass
class TransitLeg:
    kind: str
    route_id: str
    trip_id: str
    headsign: str | None
    board_stop: str
    board_time: int
    alight_stop: str
    alight_time: int


@dataclass
class _Label:
    time: int
    leg: object
    from_stop: str | None
    from_round: int | None


def run(
    graph: PlanningGraph,
    origin_stops: dict[str, tuple[int, float]],  # stop_id -> (walk_seconds, distance_m)
    start_time: int,
    max_rounds: int = MAX_ROUNDS,
) -> dict[int, dict[str, _Label]]:
    """Returns labels[round][stop_id] = _Label, for rounds 0..max_rounds."""

    labels: dict[int, dict[str, _Label]] = {k: {} for k in range(max_rounds + 1)}
    arrival: dict[int, dict[str, int]] = {k: {} for k in range(max_rounds + 1)}

    for stop_id, (walk_s, dist_m) in origin_stops.items():
        t = start_time + walk_s
        labels[0][stop_id] = _Label(
            time=t,
            leg=WalkLeg("walk", None, stop_id, dist_m, walk_s),
            from_stop=None,
            from_round=None,
        )
        arrival[0][stop_id] = t

    marked = set(origin_stops.keys())

    for k in range(1, max_rounds + 1):
        arrival[k] = dict(arrival[k - 1])
        labels[k] = dict(labels[k - 1])

        touched_patterns: dict[str, int] = {}
        for stop_id in marked:
            for pattern_id, pos in graph.stop_patterns.get(stop_id, []):
                if pattern_id not in touched_patterns or pos < touched_patterns[pattern_id]:
                    touched_patterns[pattern_id] = pos

        newly_marked: set[str] = set()

        for pattern_id, earliest_pos in touched_patterns.items():
            pattern = graph.patterns[pattern_id]
            stop_ids = pattern.stop_ids

            boarded_trip = None
            boarded_at_pos = None

            for pos in range(earliest_pos, len(stop_ids)):
                stop_id = stop_ids[pos]

                if boarded_trip is not None:
                    arr_t = boarded_trip.arrivals[pos]
                    if arr_t < arrival[k].get(stop_id, INF):
                        arrival[k][stop_id] = arr_t
                        labels[k][stop_id] = _Label(
                            time=arr_t,
                            leg=TransitLeg(
                                "transit",
                                pattern.route_id,
                                boarded_trip.trip_id,
                                boarded_trip.headsign,
                                stop_ids[boarded_at_pos],
                                boarded_trip.departures[boarded_at_pos],
                                stop_id,
                                arr_t,
                            ),
                            from_stop=stop_ids[boarded_at_pos],
                            from_round=k - 1,
                        )
                        newly_marked.add(stop_id)

                prev_arrival = arrival[k - 1].get(stop_id, INF)
                if prev_arrival < INF:
                    candidate = graph.earliest_trip(pattern_id, pos, prev_arrival + MIN_TRANSFER_S)
                    if candidate is not None and (
                        boarded_trip is None or candidate.departures[pos] < boarded_trip.departures[pos]
                    ):
                        boarded_trip = candidate
                        boarded_at_pos = pos

        for stop_id in list(newly_marked):
            t = arrival[k][stop_id]
            for other_stop, walk_s in graph.footpaths.get(stop_id, []):
                new_t = t + walk_s
                if new_t < arrival[k].get(other_stop, INF):
                    arrival[k][other_stop] = new_t
                    labels[k][other_stop] = _Label(
                        time=new_t,
                        leg=WalkLeg("walk", stop_id, other_stop, walk_s * WALK_SPEED_MPS, walk_s),
                        from_stop=stop_id,
                        from_round=k,
                    )
                    newly_marked.add(other_stop)

        if not newly_marked:
            break
        marked = newly_marked

    return labels


def reconstruct(labels: dict[int, dict[str, _Label]], round_k: int, destination_stop: str) -> list[dict]:
    """Walks parent pointers back from (round_k, destination_stop) to the origin."""
    legs: list[dict] = []
    stop = destination_stop
    k = round_k

    while stop is not None:
        label = labels[k].get(stop)
        if label is None:
            return []
        legs.append(_leg_to_dict(label.leg))
        stop, k = label.from_stop, label.from_round
        if k is None:
            break

    legs.reverse()
    return legs


def _leg_to_dict(leg) -> dict:
    if isinstance(leg, WalkLeg):
        return {
            "kind": "walk",
            "from_stop": leg.from_stop,
            "to_stop": leg.to_stop,
            "distance_m": round(leg.distance_m, 1),
            "duration_s": leg.duration_s,
        }
    return {
        "kind": "transit",
        "route_id": leg.route_id,
        "trip_id": leg.trip_id,
        "headsign": leg.headsign,
        "board_stop": leg.board_stop,
        "board_time": leg.board_time,
        "alight_stop": leg.alight_stop,
        "alight_time": leg.alight_time,
    }
