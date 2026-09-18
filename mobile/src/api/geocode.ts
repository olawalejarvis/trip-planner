import { DEFAULT_PROXIMITY, MAPTILER_KEY, NEWFOUNDLAND_BBOX } from "../config";
import type { PlaceSuggestion } from "./types";

interface MapTilerFeature {
  place_name?: string;
  text?: string;
  center: [number, number]; // [lng, lat]
}

// MapTiler's geocoding API, for arbitrary addresses. Returns [] when no key
// is configured rather than throwing, so callers can just merge results.
export async function geocodeSearch(query: string): Promise<PlaceSuggestion[]> {
  if (!MAPTILER_KEY || query.trim().length < 3) return [];

  const url = new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json`);
  url.searchParams.set("key", MAPTILER_KEY);
  url.searchParams.set("proximity", `${DEFAULT_PROXIMITY.lng},${DEFAULT_PROXIMITY.lat}`);
  url.searchParams.set("bbox", NEWFOUNDLAND_BBOX.join(","));
  url.searchParams.set("limit", "5");

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
