import AsyncStorage from "@react-native-async-storage/async-storage";
import type { LngLat } from "@maplibre/maplibre-react-native";

import type { Itinerary, PlaceSuggestion } from "../api/types";

const FAVORITES_KEY = "saved-trips:favorites";
const ITINERARIES_KEY = "saved-trips:itineraries";

export interface FavoriteTrip {
  id: string;
  label: string;
  origin: PlaceSuggestion;
  destination: PlaceSuggestion;
  createdAt: number;
}

export interface SavedItinerary {
  id: string;
  itinerary: Itinerary;
  origin: { lat: number; lng: number; label: string };
  destination: { lat: number; lng: number; label: string };
  date: string;
  savedAt: number;
  // Leg index -> real road-following path (from OSRM, same as the live itinerary
  // screen draws), captured at save time so reopening later doesn't need network
  // access or re-fetch walking directions.
  walkRoutes?: Record<number, LngLat[]>;
}

async function readList<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

async function writeList<T>(key: string, list: T[]): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Best-effort: a failed write just means it won't persist this time.
  }
}

export const favorites = {
  list: () => readList<FavoriteTrip>(FAVORITES_KEY),

  async add(label: string, origin: PlaceSuggestion, destination: PlaceSuggestion): Promise<FavoriteTrip[]> {
    const current = await readList<FavoriteTrip>(FAVORITES_KEY);
    const next = [...current, { id: String(Date.now()), label, origin, destination, createdAt: Date.now() }];
    await writeList(FAVORITES_KEY, next);
    return next;
  },

  async remove(id: string): Promise<FavoriteTrip[]> {
    const current = await readList<FavoriteTrip>(FAVORITES_KEY);
    const next = current.filter((f) => f.id !== id);
    await writeList(FAVORITES_KEY, next);
    return next;
  },
};

export const savedItineraries = {
  list: () => readList<SavedItinerary>(ITINERARIES_KEY),

  async add(
    itinerary: Itinerary,
    origin: { lat: number; lng: number; label: string },
    destination: { lat: number; lng: number; label: string },
    date: string,
    walkRoutes?: Record<number, LngLat[]>,
  ): Promise<SavedItinerary[]> {
    const current = await readList<SavedItinerary>(ITINERARIES_KEY);
    const next = [
      ...current,
      { id: String(Date.now()), itinerary, origin, destination, date, savedAt: Date.now(), walkRoutes },
    ];
    await writeList(ITINERARIES_KEY, next);
    return next;
  },

  async remove(id: string): Promise<SavedItinerary[]> {
    const current = await readList<SavedItinerary>(ITINERARIES_KEY);
    const next = current.filter((s) => s.id !== id);
    await writeList(ITINERARIES_KEY, next);
    return next;
  },
};
