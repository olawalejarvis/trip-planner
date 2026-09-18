export interface RouteSummary {
  feed_id: string;
  route_id: string;
  short_name: string | null;
  long_name: string | null;
  color: string | null;
  text_color: string | null;
  route_type: number | null;
}

export interface RouteShape {
  route_id: string;
  shape_id: string | null;
  points: { lat: number; lng: number }[];
}

export interface TripShape {
  trip_id: string;
  shape_id: string | null;
  points: { lat: number; lng: number }[];
}

export interface StopSummary {
  feed_id: string;
  stop_id: string;
  code: string | null;
  name: string;
  lat: number;
  lng: number;
  wheelchair_boarding: number | null;
}

export interface NearbyStop extends StopSummary {
  distance_m: number;
}

export interface DepartureVehicle {
  vehicle_id: string | null;
  deviation: string | null;
  sched_difference_mins: number | null;
  current_location: string | null;
}

export interface Departure {
  route_id: string;
  route_short_name: string | null;
  trip_headsign: string | null;
  scheduled_departure: string | null;
  realtime: boolean;
  vehicle: DepartureVehicle | null;
}

export interface Vehicle {
  vehicle_id: string | null;
  route_number: number | null;
  headsign: string | null;
  lat: number | null;
  lng: number | null;
  heading: string | null;
  speed: number | null;
  deviation: string | null;
  current_location: string | null;
  gtfs_trip_id: string | null;
  position_time: string | null;
}

export interface WalkLeg {
  kind: "walk";
  from_stop: string | null;
  to_stop: string | null;
  distance_m: number;
  duration_s: number;
}

export interface TransitLeg {
  kind: "transit";
  route_id: string;
  trip_id: string;
  headsign: string | null;
  board_stop: string;
  board_time: number;
  alight_stop: string;
  alight_time: number;
}

export type Leg = WalkLeg | TransitLeg;

export type ItineraryLabel = "fastest" | "fewest_transfers" | "least_walking";

export interface Itinerary {
  labels: ItineraryLabel[];
  depart_time: number;
  arrival_time: number;
  duration_s: number;
  num_transfers: number;
  total_walk_s: number;
  legs: Leg[];
}

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

export interface TripPlanResponse {
  date: string;
  itineraries: Itinerary[];
}

// A place the user picked, from either our own stop search or external geocoding.
export interface PlaceSuggestion {
  label: string;
  sublabel?: string;
  lat: number;
  lng: number;
  kind: "stop" | "address" | "current_location";
}
