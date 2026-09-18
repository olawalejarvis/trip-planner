from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import gtfs_shapes
from app.database import get_db
from app.models import ShapePoint, Trip

router = APIRouter(tags=["trips"])


@router.get("/trips/{trip_id}/shape")
def get_trip_shape(trip_id: str, feed_id: str = "metrobus", db: Session = Depends(get_db)):
    """The shape for the exact trip actually ridden -- unlike /routes/{id}/shape,
    which just picks some trip of the route and can pick a different branch/direction."""
    trip = db.get(Trip, {"feed_id": feed_id, "trip_id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    if not trip.shape_id:
        return {"trip_id": trip_id, "shape_id": None, "points": []}

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
        "trip_id": trip_id,
        "shape_id": trip.shape_id,
        "points": [{"lat": lat, "lng": lng} for lat, lng in densified],
    }
