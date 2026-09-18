import { api } from "./client";
import { DEFAULT_PROXIMITY, MAPTILER_KEY, NEWFOUNDLAND_BBOX } from "../config";
import type { PlaceSuggestion } from "./types";

interface MapTilerFeature {
  place_name?: string;
  text?: string;
  center: [number, number]; // [lng, lat]
}

// MapTiler's geocoding API, for arbitrary addresses. Returns [] when no key
// is configured rather than throwing, so callers can just merge results.
async function mapTilerSearch(query: string): Promise<PlaceSuggestion[]> {
  if (!MAPTILER_KEY) return [];

  const url = new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json`);
  url.searchParams.set("key", MAPTILER_KEY);
  url.searchParams.set("proximity", `${DEFAULT_PROXIMITY.lng},${DEFAULT_PROXIMITY.lat}`);
  url.searchParams.set("bbox", NEWFOUNDLAND_BBOX.join(","));
  url.searchParams.set("limit", "5");
  // Without this, MapTiler's default result set skips businesses/POIs entirely
  // (e.g. "Walmart" or "No Frills" return nothing, or an unrelated fuzzy
  // match) -- confirmed by comparing against the same query with types=poi.
  url.searchParams.set("types", "poi,address");

  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const data = (await res.json()) as { features?: MapTilerFeature[] };

  return (data.features ?? []).map((f) => ({
    label: f.place_name ?? f.text ?? query,
    lat: f.center[1],
    lng: f.center[0],
    kind: "address" as const,
  }));
}

// Our own backend's /geocode, which calls Google Places server-side (better
// rural/civic address coverage than MapTiler's OSM-derived data -- e.g. exact
// house numbers on streets where OSM has no address point at all, confirmed
// missing there and in Nominatim too). Kept server-side rather than called
// directly from the app: a Google key restricted by HTTP referrer (the norm
// for browser use) rejects requests with no referrer, which this app's fetch
// never sends, and an unrestricted key would ship exposed in the app bundle.
async function backendGeocodeSearch(query: string): Promise<PlaceSuggestion[]> {
  const results = await api.geocode(query);
  return results.map((r) => ({ ...r, kind: "address" as const }));
}

export async function geocodeSearch(query: string): Promise<PlaceSuggestion[]> {
  if (query.trim().length < 3) return [];

  try {
    // An empty result also covers "Google not configured server-side" (the
    // endpoint returns [] rather than an error in that case), so it falls
    // through to MapTiler here too, not just on an outright request failure.
    const results = await backendGeocodeSearch(query);
    if (results.length > 0) return results;
  } catch {
    // Fall through to MapTiler below.
  }
  return mapTilerSearch(query);
}
