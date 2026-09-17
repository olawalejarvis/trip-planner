"""GTFS static feed importer.

Downloads each configured GTFS feed, parses its .txt files, and loads them
into the multi-feed schema in app.models. Safe to re-run: existing rows for
a feed_id are replaced. Run standalone:

    python -m app.gtfs_import [--feed metrobus] [--zip path/to/local.zip]

Metrobus's terms require re-downloading at least weekly, so this is meant to
be cron'd.
"""

import argparse
import csv
import io
import zipfile
from datetime import UTC, datetime

import httpx
from geoalchemy2.elements import WKTElement
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal, engine
from app.models import (
    Agency,
    Calendar,
    CalendarDate,
    Feed,
    Route,
    ShapePoint,
    Stop,
    StopTime,
    Transfer,
    Trip,
)

FEEDS = [
    {
        "feed_id": "metrobus",
        "agency_name": "Metrobus Transit",
        "source_url": "https://www.metrobustransit.ca/google/google_transit.zip",
        "region": "St. John's / Mount Pearl / Paradise metro area",
    },
    # Add another Newfoundland operator here once it publishes GTFS, or once
    # a feed is hand-authored from its public timetable (e.g. Corner Brook
    # Transit, DRL Coachlines). No schema change needed — see PLAN.md.
]


def time_to_seconds(value: str | None) -> int | None:
    """GTFS times can exceed 24:00:00 for after-midnight trips."""
    if not value:
        return None
    h, m, s = (int(part) for part in value.split(":"))
    return h * 3600 + m * 60 + s


def parse_bool(value: str) -> bool:
    return value.strip() == "1"


def read_csv(zf: zipfile.ZipFile, name: str) -> list[dict]:
    try:
        with zf.open(name) as fh:
            text = io.TextIOWrapper(fh, encoding="utf-8-sig", newline="")
            return list(csv.DictReader(text))
    except KeyError:
        return []


def wipe_feed(db: Session, feed_id: str) -> None:
    # Deletion order respects FK dependencies (children before parents).
    for model in (StopTime, Transfer, CalendarDate, Calendar, ShapePoint, Trip, Stop, Route, Agency, Feed):
        db.execute(delete(model).where(model.feed_id == feed_id))


def import_feed(db: Session, feed_id: str, agency_name: str, source_url: str, region: str, zip_path: str | None) -> None:
    if zip_path:
        with open(zip_path, "rb") as fh:
            content = fh.read()
    else:
        resp = httpx.get(source_url, follow_redirects=True, timeout=60, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
        content = resp.content

    zf = zipfile.ZipFile(io.BytesIO(content))

    agencies = read_csv(zf, "agency.txt")
    routes = read_csv(zf, "routes.txt")
    stops = read_csv(zf, "stops.txt")
    trips = read_csv(zf, "trips.txt")
    stop_times = read_csv(zf, "stop_times.txt")
    calendars = read_csv(zf, "calendar.txt")
    calendar_dates = read_csv(zf, "calendar_dates.txt")
    shapes = read_csv(zf, "shapes.txt")
    transfers = read_csv(zf, "transfers.txt")

    feed_start = min((c["start_date"] for c in calendars), default=None)
    feed_end = max((c["end_date"] for c in calendars), default=None)

    wipe_feed(db, feed_id)

    db.execute(
        Feed.__table__.insert(),
        [
            {
                "feed_id": feed_id,
                "agency_name": agency_name,
                "source_url": source_url,
                "region": region,
                "start_date": feed_start,
                "end_date": feed_end,
                "imported_at": datetime.now(UTC),
            }
        ],
    )

    if agencies:
        db.execute(
            Agency.__table__.insert(),
            [
                {
                    "feed_id": feed_id,
                    "agency_id": a.get("agency_id") or agency_name,
                    "agency_name": a["agency_name"],
                    "agency_url": a.get("agency_url"),
                    "agency_timezone": a.get("agency_timezone"),
                    "agency_lang": a.get("agency_lang"),
                    "agency_phone": a.get("agency_phone"),
                    "agency_fare_url": a.get("agency_fare_url"),
                }
                for a in agencies
            ],
        )

    if routes:
        db.execute(
            Route.__table__.insert(),
            [
                {
                    "feed_id": feed_id,
                    "route_id": r["route_id"],
                    "agency_id": r.get("agency_id"),
                    "route_short_name": r.get("route_short_name"),
                    "route_long_name": r.get("route_long_name"),
                    "route_desc": r.get("route_desc") or None,
                    "route_type": int(r["route_type"]) if r.get("route_type") else None,
                    "route_url": r.get("route_url") or None,
                    "route_color": r.get("route_color") or None,
                    "route_text_color": r.get("route_text_color") or None,
                }
                for r in routes
            ],
        )

    if stops:
        db.execute(
            Stop.__table__.insert(),
            [
                {
                    "feed_id": feed_id,
                    "stop_id": s["stop_id"],
                    "stop_code": s.get("stop_code") or None,
                    "stop_name": s["stop_name"],
                    "stop_desc": s.get("stop_desc") or None,
                    "stop_lat": float(s["stop_lat"]),
                    "stop_lon": float(s["stop_lon"]),
                    "geom": WKTElement(f"POINT({s['stop_lon']} {s['stop_lat']})", srid=4326),
                    "zone_id": s.get("zone_id") or None,
                    "stop_url": s.get("stop_url") or None,
                    "location_type": int(s["location_type"]) if s.get("location_type") else None,
                    "parent_station": s.get("parent_station") or None,
                    "wheelchair_boarding": int(s["wheelchair_boarding"]) if s.get("wheelchair_boarding") else None,
                }
                for s in stops
            ],
        )

    if trips:
        db.execute(
            Trip.__table__.insert(),
            [
                {
                    "feed_id": feed_id,
                    "trip_id": t["trip_id"],
                    "route_id": t["route_id"],
                    "service_id": t["service_id"],
                    "trip_headsign": t.get("trip_headsign") or None,
                    "trip_short_name": t.get("trip_short_name") or None,
                    "direction_id": int(t["direction_id"]) if t.get("direction_id") else None,
                    "block_id": t.get("block_id") or None,
                    "shape_id": t.get("shape_id") or None,
                    "wheelchair_accessible": int(t["wheelchair_accessible"]) if t.get("wheelchair_accessible") else None,
                    "bikes_allowed": int(t["bikes_allowed"]) if t.get("bikes_allowed") else None,
                }
                for t in trips
            ],
        )

    if stop_times:
        db.execute(
            StopTime.__table__.insert(),
            [
                {
                    "feed_id": feed_id,
                    "trip_id": st["trip_id"],
                    "stop_sequence": int(st["stop_sequence"]),
                    "stop_id": st["stop_id"],
                    "arrival_time": st.get("arrival_time") or None,
                    "departure_time": st.get("departure_time") or None,
                    "arrival_seconds": time_to_seconds(st.get("arrival_time")),
                    "departure_seconds": time_to_seconds(st.get("departure_time")),
                    "stop_headsign": st.get("stop_headsign") or None,
                    "pickup_type": int(st["pickup_type"]) if st.get("pickup_type") else None,
                    "drop_off_type": int(st["drop_off_type"]) if st.get("drop_off_type") else None,
                    "shape_dist_traveled": float(st["shape_dist_traveled"]) if st.get("shape_dist_traveled") else None,
                    "timepoint": int(st["timepoint"]) if st.get("timepoint") else None,
                }
                for st in stop_times
            ],
        )

    if calendars:
        db.execute(
            Calendar.__table__.insert(),
            [
                {
                    "feed_id": feed_id,
                    "service_id": c["service_id"],
                    "monday": parse_bool(c["monday"]),
                    "tuesday": parse_bool(c["tuesday"]),
                    "wednesday": parse_bool(c["wednesday"]),
                    "thursday": parse_bool(c["thursday"]),
                    "friday": parse_bool(c["friday"]),
                    "saturday": parse_bool(c["saturday"]),
                    "sunday": parse_bool(c["sunday"]),
                    "start_date": c["start_date"],
                    "end_date": c["end_date"],
                }
                for c in calendars
            ],
        )

    if calendar_dates:
        db.execute(
            CalendarDate.__table__.insert(),
            [
                {
                    "feed_id": feed_id,
                    "service_id": cd["service_id"],
                    "date": cd["date"],
                    "exception_type": int(cd["exception_type"]),
                }
                for cd in calendar_dates
            ],
        )

    if shapes:
        db.execute(
            ShapePoint.__table__.insert(),
            [
                {
                    "feed_id": feed_id,
                    "shape_id": sh["shape_id"],
                    "shape_pt_sequence": int(sh["shape_pt_sequence"]),
                    "shape_pt_lat": float(sh["shape_pt_lat"]),
                    "shape_pt_lon": float(sh["shape_pt_lon"]),
                    "shape_dist_traveled": float(sh["shape_dist_traveled"]) if sh.get("shape_dist_traveled") else None,
                }
                for sh in shapes
            ],
        )

    if transfers:
        db.execute(
            Transfer.__table__.insert(),
            [
                {
                    "feed_id": feed_id,
                    "from_stop_id": tr["from_stop_id"],
                    "to_stop_id": tr["to_stop_id"],
                    "transfer_type": int(tr["transfer_type"]) if tr.get("transfer_type") else None,
                    "min_transfer_time": int(tr["min_transfer_time"]) if tr.get("min_transfer_time") else None,
                }
                for tr in transfers
            ],
        )

    db.commit()
    print(
        f"Imported feed '{feed_id}': {len(routes)} routes, {len(stops)} stops, "
        f"{len(trips)} trips, {len(stop_times)} stop_times, {len(shapes)} shape points."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Import GTFS feed(s) into the database.")
    parser.add_argument("--feed", help="Only import this feed_id (default: all configured feeds)")
    parser.add_argument("--zip", help="Use this local zip file instead of downloading (only valid with --feed)")
    args = parser.parse_args()

    if args.zip and not args.feed:
        parser.error("--zip requires --feed")

    Base.metadata.create_all(bind=engine)

    feeds = [f for f in FEEDS if not args.feed or f["feed_id"] == args.feed]
    if not feeds:
        parser.error(f"No configured feed matches '{args.feed}'")

    db = SessionLocal()
    try:
        for feed in feeds:
            import_feed(
                db,
                feed_id=feed["feed_id"],
                agency_name=feed["agency_name"],
                source_url=feed["source_url"],
                region=feed["region"],
                zip_path=args.zip,
            )
    finally:
        db.close()


if __name__ == "__main__":
    main()
