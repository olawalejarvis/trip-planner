import { API_URL } from "../config";
import type {
  Departure,
  GeocodeResult,
  NearbyStop,
  RouteShape,
  RouteSummary,
  StopSummary,
  TripPlanResponse,
  TripShape,
  Vehicle,
} from "./types";

async function get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(path, API_URL);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  nearbyStops: (lat: number, lng: number, radiusM = 800) =>
    get<NearbyStop[]>("/stops/nearby", { lat, lng, radius_m: radiusM }),

  stops: () => get<StopSummary[]>("/stops"),

  searchStops: (q: string) => get<StopSummary[]>("/stops/search", { q }),

  stop: (stopId: string) => get<StopSummary>(`/stops/${stopId}`),

  stopDepartures: (stopId: string) => get<Departure[]>(`/stops/${stopId}/departures`),

  route: (routeId: string) => get<RouteSummary>(`/routes/${routeId}`),

  routeShape: (routeId: string) => get<RouteShape>(`/routes/${routeId}/shape`),

  tripShape: (tripId: string) => get<TripShape>(`/trips/${tripId}/shape`),

  vehicles: () => get<Vehicle[]>("/vehicles"),

  geocode: (q: string) => get<GeocodeResult[]>("/geocode", { q }),

  tripPlan: (args: {
    fromLat: number;
    fromLng: number;
    toLat: number;
    toLng: number;
    date?: string;
    departAt?: number;
    arriveBy?: number;
  }) =>
    get<TripPlanResponse>("/trip-plan", {
      from_lat: args.fromLat,
      from_lng: args.fromLng,
      to_lat: args.toLat,
      to_lng: args.toLng,
      date: args.date,
      depart_at: args.departAt,
      arrive_by: args.arriveBy,
    }),
};
