from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import gtfs_shapes
from app.database import get_db
from app.models import Route, ShapePoint, Trip

router = APIRouter(tags=["routes"])


def serialize_route(r: Route) -> dict:
    return {
        "feed_id": r.feed_id,
        "route_id": r.route_id,
        "short_name": r.route_short_name,
        "long_name": r.route_long_name,
        "color": r.route_color,
        "text_color": r.route_text_color,
        "route_type": r.route_type,
    }


@router.get("/routes")
def list_routes(feed_id: str = "metrobus", db: Session = Depends(get_db)):
    rows = db.execute(select(Route).where(Route.feed_id == feed_id)).scalars().all()
    return [serialize_route(r) for r in rows]


@router.get("/routes/{route_id}")
def get_route(route_id: str, feed_id: str = "metrobus", db: Session = Depends(get_db)):
    route = db.get(Route, {"feed_id": feed_id, "route_id": route_id})
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    return serialize_route(route)


@router.get("/routes/{route_id}/shape")
def get_route_shape(route_id: str, feed_id: str = "metrobus", db: Session = Depends(get_db)):
    route = db.get(Route, {"feed_id": feed_id, "route_id": route_id})
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    trip = db.execute(
        select(Trip)
        .where(Trip.feed_id == feed_id, Trip.route_id == route_id, Trip.shape_id.is_not(None))
        .limit(1)
    ).scalar_one_or_none()

    if not trip or not trip.shape_id:
        return {"route_id": route_id, "shape_id": None, "points": []}

    points = (
        db.execute(
            select(ShapePoint)
            .where(ShapePoint.feed_id == feed_id, ShapePoint.shape_id == trip.shape_id)
            .order_by(ShapePoint.shape_pt_sequence)
        )
        .scalars()
        .all()
    )
    raw = [(p.shape_pt_lat, p.shape_pt_lon) for p in points]
    densified = gtfs_shapes.densify(trip.shape_id, raw)

    return {
        "route_id": route_id,
        "shape_id": trip.shape_id,
        "points": [{"lat": lat, "lng": lng} for lat, lng in densified],
    }
