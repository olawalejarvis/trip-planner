# Newfoundland Trip Planner

Transit trip planner built on Metrobus's real GTFS feed and live TimeTrack
data: a Python/FastAPI backend ([`backend/`](backend)) and an Expo React
Native app ([`mobile/`](mobile)). See [PLAN.md](PLAN.md) for the design and
[DISCOVERY.md](DISCOVERY.md) for the raw data investigation behind it.

## Setup

```bash
docker compose up -d              # Postgres/PostGIS on localhost:5434
cp .env.example .env

cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

python -m app.gtfs_import         # imports the Metrobus GTFS feed
uvicorn app.main:app --reload
```

API docs: http://127.0.0.1:8000/docs

## Trip planning

```
GET /trip-plan?from_lat=&from_lng=&to_lat=&to_lng=&depart_at=<seconds past local midnight>
GET /trip-plan?from_lat=&from_lng=&to_lat=&to_lng=&arrive_by=<seconds past local midnight>
```

Returns up to three ranked itineraries (fastest / fewest_transfers /
least_walking), each with a `legs` list of walk and transit segments.

## Re-importing data

Metrobus's terms require the feed to be refreshed at least weekly:

```bash
python -m app.gtfs_import
```

Run against a local zip instead of downloading:

```bash
python -m app.gtfs_import --feed metrobus --zip /path/to/google_transit.zip
```

## Mobile app

See [mobile/README.md](mobile/README.md) for setup. Needs the backend above
running, plus a free MapTiler key for the map and address search.
