import type { LngLat } from "@maplibre/maplibre-react-native";

// OSRM's free public demo server -- no key needed, but it's a shared
// community instance not meant for heavy/production traffic. Fine for now;
// swap for a self-hosted OSRM (or a paid provider) before real scale.
const OSRM_FOOT_URL = "https://router.project-osrm.org/route/v1/foot";

interface OsrmResponse {
  code: string;
  routes?: { geometry: { coordinates: [number, number][] } }[];
}

/** Real street-following walking path between two points. Falls back to a
 * straight line (still correct, just not road-accurate) if OSRM is
 * unreachable or finds no route. OSRM snaps each input to the nearest
 * routable road/path node, which can be a few meters off the real point
 * (especially indoors or in a parking lot) -- the returned path's ends are
 * forced back to the exact requested coordinates so it visibly starts and
 * finishes right at them instead of leaving a small visible gap. */
export async function walkingRoute(from: LngLat, to: LngLat): Promise<LngLat[]> {
  try {
    const url = `${OSRM_FOOT_URL}/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return [from, to];
    const data = (await res.json()) as OsrmResponse;
    const coords = data.routes?.[0]?.geometry.coordinates;
    if (!coords || coords.length < 2) return [from, to];
    const path = coords.map((c) => [c[0], c[1]] as LngLat);
    path[0] = from;
    path[path.length - 1] = to;
    return path;
  } catch {
    return [from, to];
  }
}
