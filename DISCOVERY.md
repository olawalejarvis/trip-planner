# Data Discovery — Metrobus GTFS & Live TimeTrack

Raw findings from directly downloading and probing the real Metrobus data
sources (2026-09-17), plus research into what other Newfoundland transit
agencies publish. This is the primary-source backing for [PLAN.md](PLAN.md).

## 1. Static GTFS feed

- Developer page: `https://www.metrobus.com/gtfs.asp`
- Download link: `https://www.metrobustransit.ca/google/google_transit.zip`
  (1.2 MB zip, last modified 2026-09-01)

### Files present (standard GTFS static, no GTFS-Realtime)

| File | Rows (excl. header) | Notes |
|---|---:|---|
| `agency.txt` | 1 | Single agency: `MB` / METROBUS |
| `routes.txt` | 22 | route_type 3 (bus) for all |
| `stops.txt` | 916 | lat/lon as plain floats |
| `trips.txt` | 1,890 | |
| `stop_times.txt` | 67,305 | |
| `shapes.txt` | 67,367 | |
| `calendar.txt` | 3 | service patterns |
| `calendar_dates.txt` | 6 | holiday exceptions |
| `transfers.txt` | 7 | same-stop transfer rules only |

### `agency.txt`
```
agency_id,agency_name,agency_url,agency_timezone,agency_lang,agency_phone,agency_fare_url
MB,METROBUS,https://www.metrobus.com,America/St_Johns,en,709-722-9400,https://www.metrobus.com/fares/
```

### `calendar.txt` (current fall schedule)
```
service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
1,0,0,0,0,0,1,0,20260907,20261101   # Saturday
2,0,0,0,0,0,0,1,20260907,20261101   # Sunday
5,1,1,1,1,1,0,0,20260907,20261101   # Weekday
```

### `calendar_dates.txt`
```
service_id,date,exception_type
5,20260907,2   # weekday service removed
2,20260907,1   # Sunday service added (holiday running Sunday schedule)
5,20261012,2
2,20261012,1
5,20261111,2
2,20261111,1
```
(Pattern: on named holidays, weekday service is suppressed and Sunday
service runs instead — Labour Day, Thanksgiving, Remembrance Day.)

### `routes.txt` — all 22 routes (this *is* the full Metrobus network)
```
route_id,route_short_name,route_long_name
1,1,Village-Institutes
2,2,Malls via Lemarchant-Elizabeth
3,3,Village-Stavanger
6,6,Village-Sesame Pk-Galway
9,9,Torbay Rd-Institutes
10,10,Downtown-MUN-Avalon-Kelsey
11,11,Shea Hts-Downtown-Avalon Mall
12,12,Avalon Mall-Village
13,13,Cowan Heights Insitutes Express
14,14,Airport Hts-Torbay Rd-MUN
15,15,Forest Rd-Bonaventure-MUN-Avalon
16,16,Kenmount Terrace-Institutes
18,18,Goulds-Kilbride-Village
19,19,Village-Cowan Hts-Mundy Pd-Avalon
20,20,Galway-Village Mall
21,21,Mount Pearl
22,22,Donovans
23,23,Stavanger to Mall
24,24,Airport Hts Express
26,26,Kenmount Terrace Semi Express
29,29,Signal Hill-UC-Mount Scio Rd
30,30,Paradise
```
Note: service area is wider than "St. John's" alone — Route 21 (Mount
Pearl), Route 30 (Paradise), and Route 22 (Donovans) extend into
neighbouring municipalities within the metro area.

### `stops.txt` sample
```
stop_id,stop_code,stop_name,stop_lat,stop_lon,wheelchair_boarding
2646,2646,Seaborn St opp McLaren Pl,47.56552,-52.76978,0
1415,1415,The Boulevard opp CNIB,47.579881,-52.699239,0
1835,1835,Military Rd at Bannerman Park,47.57014,-52.707104,0
```

### `trips.txt` sample
```
route_id,service_id,trip_id,trip_headsign,direction_id,block_id,shape_id
1,5,261561,MUN-CNA-MI,0,01-1,21471
1,5,261562,MUN-CNA-MI,0,01-1,21468
```

### `stop_times.txt` sample
```
trip_id,arrival_time,departure_time,stop_id,stop_sequence,stop_headsign
261660,10:13:55,10:13:55,1180,34,MUN-CNA-MI
261678,20:40:00,20:40:00,1100,19,MUN-CNA-MI
```

### `shapes.txt` sample
```
shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence,shape_dist_traveled
21466,47.556609,-52.74029,133,4.6508
21467,47.572629,-52.73722,183,7.3474
```

### `transfers.txt` (full — same-stop only, no cross-route transfer rules given)
```
from_stop_id,to_stop_id,transfer_type,min_transfer_time
1000,1000,1,
1150,1150,1,
1600,1600,1,
1525,1525,1,
1700,1700,1,
1815,1815,1,
1405,1405,1,
```

## 2. Live TimeTrack endpoint (undocumented, verified working)

`GET https://www.metrobus.co.ca/api/timetrack/json/`

- Not linked from any official developer page — found via a third-party
  tracker project, confirmed live by directly curling it.
- Response: `HTTP/2 200`, `content-type: text/html` (misleading — body is a
  valid JSON array), **no `Access-Control-Allow-Origin` header**, so it must
  be consumed server-side (our backend), not directly from a browser or the
  React Native app.
- At test time: 16 vehicles currently active/reporting.

### Sample record (fields, real values)
```json
{
  "routerun": "Rt 1-1",
  "current_route": "01-1",
  "bulletin": "None",
  "routenumber": 1,
  "vehicle": "1202",
  "time_stamp": "6:37 AM",
  "deviation": "3 MINS BEHIND",
  "service": "5",
  "current_location": "Cornwall Ave opp OReilly St",
  "bus_lat": "47.54445",
  "bus_lon": "-52.73372",
  "heading": "NNE",
  "speed": 39,
  "position_time": "6:37 AM",
  "position_time_seconds": 23879,
  "gtfs_trip_headsign": "MUN-CNA-MI",
  "gtfs_service_id": "5",
  "wifi": "Y",
  "gtfs_stop_sequence_status": "BEHIND",
  "gtfs_stop_sequence_mins_from_stop": 3,
  "gtfs_stop_sequence_deviation": "3 MINS BEHIND",
  "gtfs_stop_sequence_closest_stop": "Cornwall Ave opp OReilly St",
  "gtfs_stop_sequence_sched_difference_mins": -3,
  "gtfs_stop_sequence_trip_id": "261561",
  "gtfs_trip_id": "261561",
  "gtfs_stop_sequence_actual": 8,
  "departure_time_at_closest_stop": "23640",
  "exception": "N",
  "shortstatus": "B3"
}
```

Key point: `gtfs_trip_id` correlates directly to `trips.txt`'s `trip_id`
column, so live vehicle positions can be joined straight onto the imported
GTFS schedule data.

Historical documentation (Metrobus/MUN publication) states the web version
of TimeTrack historically polled the AVL server roughly every 90 seconds and
cached the result server-side — treat that as an approximate, not guaranteed
current, refresh interval when deciding our own poll/cache TTL.

## 3. Metrobus GTFS terms of use (from `metrobus.com/gtfs.asp`, fetched directly)

- **Ownership**: Metrobus retains all IP rights; users acquire no
  proprietary rights through use or distribution.
- **License grant**: "a limited, revocable, and non-exclusive license to
  use, reproduce, and redistribute the Data."
- **Commercial use**: Metrobus reserves the right to impose additional terms
  or fees if the data is monetized (directly or indirectly charging
  end-users for access).
- **Required attribution**: "Data used in this product or service is
  provided by Metrobus Transit, however Metrobus Transit assumes no
  responsibility for the accuracy or currency" — must be surfaced in the app.
- **Branding restriction**: cannot use Metrobus domain names, trademarks,
  official marks, or logos without written consent, and cannot represent or
  imply affiliation. → avoid app names like "Official Metrobus Tracker".
- **Refresh requirement**: "You agree to keep the data in your application
  current by downloading the latest copy of the Data from our website on a
  weekly basis." → the GTFS importer must be run at least weekly.
- **Liability**: data provided "as is", no warranties; Metrobus disclaims
  liability for inaccuracy or system failures.
- **Indemnification**: users must indemnify Metrobus against claims from
  their use/distribution of the data.

## 4. Newfoundland-wide transit coverage check

Researched what other NL transit systems publish, to ground the "whole of
Newfoundland" scope honestly rather than assume coverage that doesn't exist:

| Operator | Area | Public GTFS? |
|---|---|---|
| Metrobus | St. John's, Mount Pearl, Paradise, Donovans metro area | **Yes** — the feed above |
| Corner Brook Transit | Corner Brook (west coast) | No — municipally run, operated under contract by Buckles Busing Ltd., no published GTFS found |
| DRL Coachlines | Island-wide intercity coach (~25 stops, Port aux Basques ↔ St. John's) | No — fixed published timetable only, no GTFS |
| Gander | Gander area | No evidence of any transit GTFS |
| Labrador City | Labrador City area | No evidence of any transit GTFS |

Confirmed via Transitland / Mobility Database, which lists exactly one NL
operator (Metrobus, `o-fb6q-metrobus`). Practical implication: real
province-wide coverage today = Metrobus's own multi-municipality service
area. Anything beyond that (Corner Brook, DRL, etc.) would require someone
hand-authoring a GTFS feed from public timetables — real, doable work, just
not something we can import as-is.

## 5. Walking directions (mobile app)

The itinerary detail screen originally drew walk legs as a straight line
between two points, which cuts across blocks/buildings on the actual map and
doesn't reflect a real path. Fixed by routing walk legs through **OSRM's
free public demo server**, which has a dedicated pedestrian profile:

```
GET https://router.project-osrm.org/route/v1/foot/{lng1},{lat1};{lng2},{lat2}?overview=full&geometries=geojson
```

- No API key needed.
- `routes[0].geometry.coordinates` is a GeoJSON `[lng, lat]` array following
  actual streets/paths (OpenStreetMap data), not a straight line.
- Verified against real St. John's coordinates (MUN Centre area): returned a
  1.2 km street-following path in ~150s estimated walk time.
- **Caveat**: `router.project-osrm.org` is OSRM's shared public demo
  instance — free and fine for development, but explicitly not intended for
  production-scale traffic per OSRM's fair-use expectations. Before real
  usage at scale, swap this for a self-hosted OSRM instance (OSRM is
  open-source) or a paid routing provider (e.g. GraphHopper, MapTiler's
  Directions API — currently in beta as of this writing).

Implementation: `mobile/src/api/directions.ts` (`walkingRoute()`), called
from `mobile/app/itinerary.tsx` for each walk leg, with a straight-line
fallback if the request fails.
