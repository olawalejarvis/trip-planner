from datetime import UTC, datetime

from geoalchemy2 import Geography
from sqlalchemy import (
    Date,
    DateTime,
    Float,
    ForeignKeyConstraint,
    Index,
    Integer,
    SmallInteger,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Feed(Base):
    """One imported GTFS feed. Every other table hangs off feed_id so
    multiple agencies/regions can coexist without schema changes."""

    __tablename__ = "feed"

    feed_id: Mapped[str] = mapped_column(String, primary_key=True)
    agency_name: Mapped[str] = mapped_column(String)
    source_url: Mapped[str] = mapped_column(String)
    region: Mapped[str] = mapped_column(String)
    start_date: Mapped[str] = mapped_column(String, nullable=True)
    end_date: Mapped[str] = mapped_column(String, nullable=True)
    imported_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))


class Agency(Base):
    __tablename__ = "agency"

    feed_id: Mapped[str] = mapped_column(String, primary_key=True)
    agency_id: Mapped[str] = mapped_column(String, primary_key=True)
    agency_name: Mapped[str] = mapped_column(String)
    agency_url: Mapped[str] = mapped_column(String, nullable=True)
    agency_timezone: Mapped[str] = mapped_column(String, nullable=True)
    agency_lang: Mapped[str] = mapped_column(String, nullable=True)
    agency_phone: Mapped[str] = mapped_column(String, nullable=True)
    agency_fare_url: Mapped[str] = mapped_column(String, nullable=True)


class Route(Base):
    __tablename__ = "route"

    feed_id: Mapped[str] = mapped_column(String, primary_key=True)
    route_id: Mapped[str] = mapped_column(String, primary_key=True)
    agency_id: Mapped[str] = mapped_column(String, nullable=True)
    route_short_name: Mapped[str] = mapped_column(String, nullable=True)
    route_long_name: Mapped[str] = mapped_column(String, nullable=True)
    route_desc: Mapped[str] = mapped_column(String, nullable=True)
    route_type: Mapped[int] = mapped_column(SmallInteger, nullable=True)
    route_url: Mapped[str] = mapped_column(String, nullable=True)
    route_color: Mapped[str] = mapped_column(String, nullable=True)
    route_text_color: Mapped[str] = mapped_column(String, nullable=True)


class Stop(Base):
    __tablename__ = "stop"

    feed_id: Mapped[str] = mapped_column(String, primary_key=True)
    stop_id: Mapped[str] = mapped_column(String, primary_key=True)
    stop_code: Mapped[str] = mapped_column(String, nullable=True)
    stop_name: Mapped[str] = mapped_column(String)
    stop_desc: Mapped[str] = mapped_column(String, nullable=True)
    stop_lat: Mapped[float] = mapped_column(Float)
    stop_lon: Mapped[float] = mapped_column(Float)
    geom = mapped_column(Geography(geometry_type="POINT", srid=4326))
    zone_id: Mapped[str] = mapped_column(String, nullable=True)
    stop_url: Mapped[str] = mapped_column(String, nullable=True)
    location_type: Mapped[int] = mapped_column(SmallInteger, nullable=True)
    parent_station: Mapped[str] = mapped_column(String, nullable=True)
    wheelchair_boarding: Mapped[int] = mapped_column(SmallInteger, nullable=True)

    __table_args__ = (Index("ix_stop_geom", "geom", postgresql_using="gist"),)


class Trip(Base):
    __tablename__ = "trip"

    feed_id: Mapped[str] = mapped_column(String, primary_key=True)
    trip_id: Mapped[str] = mapped_column(String, primary_key=True)
    route_id: Mapped[str] = mapped_column(String)
    service_id: Mapped[str] = mapped_column(String)
    trip_headsign: Mapped[str] = mapped_column(String, nullable=True)
    trip_short_name: Mapped[str] = mapped_column(String, nullable=True)
    direction_id: Mapped[int] = mapped_column(SmallInteger, nullable=True)
    block_id: Mapped[str] = mapped_column(String, nullable=True)
    shape_id: Mapped[str] = mapped_column(String, nullable=True)
    wheelchair_accessible: Mapped[int] = mapped_column(SmallInteger, nullable=True)
    bikes_allowed: Mapped[int] = mapped_column(SmallInteger, nullable=True)

    __table_args__ = (
        ForeignKeyConstraint(["feed_id", "route_id"], ["route.feed_id", "route.route_id"]),
    )


class StopTime(Base):
    __tablename__ = "stop_time"

    feed_id: Mapped[str] = mapped_column(String, primary_key=True)
    trip_id: Mapped[str] = mapped_column(String, primary_key=True)
    stop_sequence: Mapped[int] = mapped_column(Integer, primary_key=True)
    stop_id: Mapped[str] = mapped_column(String)
    arrival_time: Mapped[str] = mapped_column(String, nullable=True)
    departure_time: Mapped[str] = mapped_column(String, nullable=True)
    # Seconds past local midnight, GTFS-style (can exceed 86400 for after-midnight trips).
    # Precomputed at import time so "departures around now" queries can sort/filter cheaply.
    arrival_seconds: Mapped[int] = mapped_column(Integer, nullable=True)
    departure_seconds: Mapped[int] = mapped_column(Integer, nullable=True)
    stop_headsign: Mapped[str] = mapped_column(String, nullable=True)
    pickup_type: Mapped[int] = mapped_column(SmallInteger, nullable=True)
    drop_off_type: Mapped[int] = mapped_column(SmallInteger, nullable=True)
    shape_dist_traveled: Mapped[float] = mapped_column(Float, nullable=True)
    timepoint: Mapped[int] = mapped_column(SmallInteger, nullable=True)

    __table_args__ = (
        ForeignKeyConstraint(["feed_id", "trip_id"], ["trip.feed_id", "trip.trip_id"]),
        ForeignKeyConstraint(["feed_id", "stop_id"], ["stop.feed_id", "stop.stop_id"]),
    )


class Calendar(Base):
    __tablename__ = "calendar"

    feed_id: Mapped[str] = mapped_column(String, primary_key=True)
    service_id: Mapped[str] = mapped_column(String, primary_key=True)
    monday: Mapped[bool] = mapped_column()
    tuesday: Mapped[bool] = mapped_column()
    wednesday: Mapped[bool] = mapped_column()
    thursday: Mapped[bool] = mapped_column()
    friday: Mapped[bool] = mapped_column()
    saturday: Mapped[bool] = mapped_column()
    sunday: Mapped[bool] = mapped_column()
    start_date: Mapped[str] = mapped_column(String)
    end_date: Mapped[str] = mapped_column(String)


class CalendarDate(Base):
    __tablename__ = "calendar_date"

    feed_id: Mapped[str] = mapped_column(String, primary_key=True)
    service_id: Mapped[str] = mapped_column(String, primary_key=True)
    date: Mapped[str] = mapped_column(String, primary_key=True)
    exception_type: Mapped[int] = mapped_column(SmallInteger)


class ShapePoint(Base):
    __tablename__ = "shape_point"

    feed_id: Mapped[str] = mapped_column(String, primary_key=True)
    shape_id: Mapped[str] = mapped_column(String, primary_key=True)
    shape_pt_sequence: Mapped[int] = mapped_column(Integer, primary_key=True)
    shape_pt_lat: Mapped[float] = mapped_column(Float)
    shape_pt_lon: Mapped[float] = mapped_column(Float)
    shape_dist_traveled: Mapped[float] = mapped_column(Float, nullable=True)


class Transfer(Base):
    __tablename__ = "transfer"

    feed_id: Mapped[str] = mapped_column(String, primary_key=True)
    from_stop_id: Mapped[str] = mapped_column(String, primary_key=True)
    to_stop_id: Mapped[str] = mapped_column(String, primary_key=True)
    transfer_type: Mapped[int] = mapped_column(SmallInteger, nullable=True)
    min_transfer_time: Mapped[int] = mapped_column(Integer, nullable=True)
