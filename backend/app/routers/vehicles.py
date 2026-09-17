from fastapi import APIRouter

from app import timetrack

router = APIRouter(tags=["vehicles"])


def serialize_vehicle(v: dict) -> dict:
    return {
        "vehicle_id": v.get("vehicle"),
        "route_number": v.get("routenumber"),
        "headsign": v.get("gtfs_trip_headsign"),
        "lat": float(v["bus_lat"]) if v.get("bus_lat") else None,
        "lng": float(v["bus_lon"]) if v.get("bus_lon") else None,
        "heading": v.get("heading"),
        "speed": v.get("speed"),
        "deviation": v.get("deviation"),
        "current_location": v.get("current_location"),
        "gtfs_trip_id": v.get("gtfs_trip_id"),
        "position_time": v.get("position_time"),
    }


@router.get("/vehicles")
def list_vehicles():
    return [serialize_vehicle(v) for v in timetrack.get_vehicles()]


@router.get("/routes/{route_number}/vehicles")
def vehicles_for_route(route_number: int):
    return [serialize_vehicle(v) for v in timetrack.vehicles_for_route(route_number)]
