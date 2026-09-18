# NL Transit (mobile)

Expo React Native app for the Newfoundland trip planner, built against the
API in [`../backend`](../backend). See the root [PLAN.md](../PLAN.md) for the
overall project design.

## Setup

```bash
cp .env.example .env
# edit .env: set EXPO_PUBLIC_MAPTILER_KEY (free key at https://cloud.maptiler.com/)
# EXPO_PUBLIC_API_URL defaults to 10.0.2.2:8000 (Android emulator -> host machine)

npm install
npx expo run:android   # builds and installs locally via your Android Studio/SDK
```

No Expo account or EAS is required — `expo run:android` compiles the native
app on your machine, the same way a bare React Native CLI project would.

Note: `@maplibre/maplibre-react-native` requires a development build and
**does not work in Expo Go** (it's a native module, not part of the Expo Go
runtime). Use `expo run:android` / `expo run:ios` as above.

## Structure

- `app/` — Expo Router screens (file-based routing)
  - `(tabs)/index.tsx` — Nearby stops (uses device location)
  - `(tabs)/plan.tsx` — Trip planner (From/To autosuggest, depart-at/arrive-by)
  - `(tabs)/map.tsx` — MapLibre map with nearby stops and live vehicles
  - `stop/[stopId].tsx` — Stop departures, auto-refreshing
  - `route/[routeId].tsx` — Route shape on the map
- `src/api/` — typed API client for the backend, plus MapTiler geocoding
- `src/components/` — `AddressAutocomplete`, `ItineraryCard`
- `src/hooks/useCurrentLocation.ts` — wraps `expo-location`

## Address autosuggest

`AddressAutocomplete` merges two sources as you type: the backend's
`/stops/search` (instant, covers known stops/landmarks) and MapTiler's
geocoding API (arbitrary addresses). Both need the API/MapTiler key
configured to return anything.

## Verification done so far

This environment has no Android/iOS emulator or macOS, so the app has **not**
been run or visually verified on a device. What has been checked:

- `npx tsc --noEmit` — passes with zero errors across the whole app.
- `npx expo export --platform android` — Metro bundles all 1,345 modules
  (including the MapLibre native module's JS side) with no resolution errors.

Before relying on this, run it on an emulator/device and click through the
Home → Stop, Map, and Trip Planner flows against a running backend.
