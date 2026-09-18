// Android emulator reaches the host machine at 10.0.2.2, not localhost.
// Override with EXPO_PUBLIC_API_URL for a physical device (use your machine's LAN IP) or iOS simulator.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:8000";

export const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY ?? "";

export const MAPTILER_STYLE_URL = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`
  : null;

// Biases geocoding results toward Metrobus's coverage area (St. John's / Mount Pearl / Paradise).
export const DEFAULT_PROXIMITY = { lat: 47.5675, lng: -52.7407 };

// [west, south, east, north] bounding box for the island of Newfoundland (excludes Labrador,
// which has no transit data in this app -- see DISCOVERY.md). Used to restrict address search
// so results outside the app's coverage area aren't suggested.
export const NEWFOUNDLAND_BBOX: [number, number, number, number] = [-59.5, 46.5, -52.5, 51.7];
