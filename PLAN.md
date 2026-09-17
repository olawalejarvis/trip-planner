# Newfoundland Trip Planner — GTFS-backed backend foundation

## Context

This project builds a Newfoundland-wide transit trip-planner app, originating
from a shared ChatGPT conversation about St. John's Metrobus
(https://chatgpt.com/share/6aac4822-35dc-83ea-9080-c76d5c95672d). Scope was
later extended: the app should cover **all of Newfoundland**, not just
St. John's — so the backend is agency-agnostic from the start rather than
hardcoded to Metrobus. The product idea: enter From/To (or "arrive by" a
time), get several route options (fastest / least walking / fewest
transfers), save the chosen itinerary, and get it back **offline**, plus a
smart "time to leave" notification that accounts for walking time. Recurring
trips are an explicit v2 feature, not now.

The chat concluded the right first move is *not* to write the React Native
UI, but to pull the real Metrobus GTFS feed, see what data actually exists,
and design the DB schema + API around it. That investigation has been done
(see [DISCOVERY.md](DISCOVERY.md) for the raw findings) — this plan turns it
into a working backend foundation the mobile app can later be built against.

Stack: **Python (FastAPI) + PostgreSQL/PostGIS** for the backend; React
Native comes in a later phase, not part of this plan.

## Findings summary

See [DISCOVERY.md](DISCOVERY.md) for full detail. Headlines:

- Metrobus publishes a real, importable static GTFS feed (22 routes, ~916
  stops, ~1,890 trips) — no GTFS-Realtime feed, but a working undocumented
  live-vehicle JSON endpoint (TimeTrack) exists and correlates to GTFS
  `trip_id`.
- Metrobus's own route list shows it already covers more than the city of
  St. John's — Route 21 "Mount Pearl", Route 30 "Paradise", Route 22
  "Donovans" are all in the feed.
- Metrobus is the *only* Newfoundland transit operator with a public GTFS
  feed today. Corner Brook Transit and DRL Coachlines (island-wide intercity
  coach) publish schedules but no GTFS; Gander and Labrador City show no
  transit GTFS at all. "Whole of Newfoundland" is therefore addressed at the
  **architecture level** (multi-agency, multi-feed schema) now, with actual
  data import scoped to Metrobus until another feed exists or is hand-built.
- Metrobus's GTFS terms require weekly refresh and attribution, and prohibit
  implying official affiliation.

## Approach

Build a FastAPI backend in `backend/` that imports GTFS feed(s) into a
multi-agency PostgreSQL/PostGIS schema and exposes a clean, province-wide
read API, plus a proxy over Metrobus's live TimeTrack endpoint. This is the
foundation for the API shape the chat proposed (`/routes`, `/stops`,
`/stops/:id/departures`, `/stops/nearby`, `/vehicles`) — none of it is
St. John's-specific; Metrobus just happens to be the only feed with real data
to import right now. Trip-planning (multi-leg journey search with transfers)
and the React Native app are follow-on phases, intentionally out of scope
here.

### 1. Project scaffold
- `backend/` — Python project (`requirements.txt`, `app/` package), FastAPI +
  Uvicorn.
- `docker-compose.yml` at repo root — a `postgis/postgis` container for local
  Postgres + PostGIS, so `ST_DWithin` nearby-stop queries work.
- `.env.example` for `DATABASE_URL`, etc.

### 2. Data model (`backend/app/models.py`, SQLAlchemy 2.0 + GeoAlchemy2)
Mirror the GTFS tables actually present in the feed, one table per file:
`agency`, `route`, `stop` (with a `geography(Point, 4326)` column derived
from `stop_lat`/`stop_lon` for proximity queries), `trip`, `stop_time`,
`calendar`, `calendar_date`, `shape_point`, `transfer`. Keep GTFS field names
close to source so the importer stays simple and the schema is verifiable
against the real files.

To make this genuinely province-wide rather than Metrobus-specific, add a
`feed` table (`feed_id`, `agency_name`, `source_url`, `region` e.g. "St.
John's" / "Corner Brook" / "Island-wide", `start_date`, `end_date`,
`imported_at`) that every GTFS row references via a `feed_id` FK alongside
its native `agency_id`. GTFS `route_id`/`stop_id`/`trip_id` are only unique
*within* a feed, so primary keys become `(feed_id, route_id)` etc. — this is
what lets a second agency (Corner Brook Transit, a hand-built DRL Coachlines
feed, etc.) be added later purely by importing another feed, with zero
schema changes. `/stops/nearby` naturally becomes cross-agency for free once
more than one feed is loaded, since it's just a geography query.

### 3. GTFS importer (`backend/app/gtfs_import.py`)
A script driven by a small config list of `(feed_id, source_url_or_path,
region)` entries — today that list has exactly one entry, Metrobus, since
it's the only NL operator with a public GTFS feed. For each entry: download
(or read a local path to) the ZIP, parse each `.txt` with the `csv` module,
tag every row with its `feed_id`, and bulk-upsert into the tables above.
Records each feed's `start_date`/`end_date` and import timestamp. Runnable
standalone (`python -m app.gtfs_import`) so it can be cron'd weekly, per
Metrobus's terms. Adding Corner Brook or DRL later — whether they publish
GTFS themselves or one is hand-authored from their public timetables — is
just another config entry, not a rewrite.

### 4. Core read API (`backend/app/routers/`)
- `GET /routes`, `GET /routes/{route_id}`, `GET /routes/{route_id}/shape`
- `GET /stops`, `GET /stops/{stop_id}`
- `GET /stops/nearby?lat=&lng=&radius_m=` — PostGIS `ST_DWithin` query
- `GET /stops/{stop_id}/departures` — computed from `stop_times` + `calendar`
  for "today" (or a given date/time), marked `realtime: false`

### 5. Live TimeTrack integration (`backend/app/timetrack.py`)
A thin client that fetches `metrobus.co.ca/api/timetrack/json/` server-side,
short-TTL caches it (the historical doc says the source refreshes ~every
90s), and correlates `gtfs_trip_id` back to our `trip`/`stop_time` rows.
Exposes:
- `GET /vehicles` — all currently active buses
- `GET /routes/{route_id}/vehicles`
- Blends into `/stops/{stop_id}/departures` as `realtime: true` entries with
  `minutesAway` when a matching vehicle is found, falling back to the
  scheduled time otherwise.

### 6. Attribution
Add the required Metrobus data-attribution text as a constant/served value
(e.g. `GET /about` or in API docs), so the mobile app can surface it per the
GTFS terms.

### 7. Trip planning (`backend/app/planner/`) — done
`GET /trip-plan?from_lat&from_lng&to_lat&to_lng&depart_at|arrive_by&date` runs
a RAPTOR (round-based public transit routing) search over an in-memory graph
built from that day's active trips: patterns (route + ordered stop sequence),
each pattern's trips sorted by departure time, and stop-to-stop footpaths
computed via PostGIS `ST_DWithin` (250m radius). Each RAPTOR round = "reachable
with at most k trips", so the per-round results directly give the ranked
alternatives: **fastest** (earliest overall arrival), **fewest_transfers**
(lowest round with a finite arrival), **least_walking** (minimum total walk
time among the Pareto set) — deduplicated when one itinerary wins multiple
labels. `arrive_by` is a binary search over `depart_at` using the same
forward algorithm (GTFS schedules are FIFO, so feasibility is monotonic in
depart time) rather than a separate backward RAPTOR. A 90-second minimum
transfer buffer prevents physically-impossible instant transfers. Verified
against real data: MUN Centre → Avalon Mall direct (Route 10, no transfer),
and a cross-town Goulds → Airport Heights route correctly transferring
through the Village Shopping Centre hub (Routes 18 → 1 → 14).

### Explicitly not in this phase
- Offline sync / SQLite mirroring, saved trips, local notifications — mobile
  app concerns, later phase.
- React Native app itself.
- Actually importing Corner Brook Transit or DRL Coachlines data — neither
  publishes GTFS today, so covering them means hand-authoring a feed from
  their public timetables, which is real work worth its own task once
  Metrobus's slice is verified end-to-end.

## Verification
- `docker compose up -d` brings up Postgres/PostGIS; confirm with `psql` that
  it accepts connections.
- Run the importer against the Metrobus GTFS ZIP and confirm row counts
  roughly match the real files (22 routes, ~916 stops, ~1890 trips).
- Start the API (`uvicorn app.main:app --reload`) and manually check:
  - `/stops/nearby?lat=47.5675&lng=-52.7407&radius_m=500` returns real
    MUN-area stops (e.g. MUN Centre, stop 1150).
  - `/routes/1` and `/routes/1/shape` return real route 1 data matching
    `routes.txt`/`shapes.txt`.
  - `/stops/1150/departures` returns scheduled times matching
    `stop_times.txt`.
  - `/vehicles` returns live data matching what `curl
    https://www.metrobus.co.ca/api/timetrack/json/` returns at that moment.
