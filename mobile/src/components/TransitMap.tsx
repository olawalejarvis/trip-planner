import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Camera, GeoJSONSource, Images, Layer, Map, UserLocation, type LngLat } from "@maplibre/maplibre-react-native";
import { useRouter } from "expo-router";

import busIcon from "../../assets/images/bus-icon.png";
import stopIcon from "../../assets/images/stop-icon.png";
import { api } from "../api/client";
import { MAPTILER_STYLE_URL } from "../config";
import { useCurrentLocation } from "../hooks/useCurrentLocation";
import type { StopSummary, Vehicle } from "../api/types";

const STOP_ICON_KEY = "stop-icon";
const BUS_ICON_KEY = "bus-icon";
const VEHICLE_REFRESH_MS = 20_000;
const DEFAULT_CENTER: LngLat = [-52.7407, 47.5675]; // St. John's, used until location resolves

interface Props {
  /** Overrides the camera center; defaults to the device's current location. Ignored when followUser is true. */
  center?: LngLat;
  zoom?: number;
  /** Keeps the camera locked on the device's live GPS position as it moves (for the Map tab, not a fixed itinerary view). */
  followUser?: boolean;
  /** Extra overlays (e.g. an itinerary's route/walk lines), drawn under the stop/vehicle icons. */
  children?: ReactNode;
}

/** The map shared by the Map tab and the itinerary detail screen: base
 * tiles, live vehicles, and nearby-stop icons (tap to open that stop). */
export function TransitMap({ center, zoom = 14, followUser = false, children }: Props) {
  const router = useRouter();
  const { coords } = useCurrentLocation();
  const [stops, setStops] = useState<StopSummary[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  useEffect(() => {
    // Only ~916 stops in the whole feed, so load them all once rather than a
    // radius around the device -- otherwise stops vanish as soon as the map
    // is panned/zoomed away from the user's current location.
    api
      .stops()
      .then(setStops)
      .catch(() => setStops([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api
        .vehicles()
        .then((v) => {
          if (!cancelled) setVehicles(v);
        })
        .catch(() => {
          if (!cancelled) setVehicles([]);
        });
    };
    load();
    const interval = setInterval(load, VEHICLE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const stopsGeoJSON = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point, { stop_id: string }>>(
    () => ({
      type: "FeatureCollection",
      features: stops.map((stop) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [stop.lng, stop.lat] },
        properties: { stop_id: stop.stop_id },
      })),
    }),
    [stops],
  );

  const vehiclesGeoJSON = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point, { route_number: string }>>(
    () => ({
      type: "FeatureCollection",
      features: vehicles
        .filter((v) => v.lat != null && v.lng != null)
        .map((v) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [v.lng as number, v.lat as number] },
          properties: { route_number: String(v.route_number ?? "") },
        })),
    }),
    [vehicles],
  );

  if (!MAPTILER_STYLE_URL) {
    return (
      <View style={styles.center}>
        <Text style={styles.missingKeyText}>
          Set EXPO_PUBLIC_MAPTILER_KEY in your .env to see the map (free key at maptiler.com).
        </Text>
      </View>
    );
  }

  const resolvedCenter: LngLat = center ?? (coords ? [coords.lng, coords.lat] : DEFAULT_CENTER);

  return (
    <Map mapStyle={MAPTILER_STYLE_URL} style={styles.map}>
      {followUser ? <Camera trackUserLocation="default" zoom={zoom} /> : <Camera center={resolvedCenter} zoom={zoom} />}
      <UserLocation accuracy heading />

      <Images images={{ [STOP_ICON_KEY]: stopIcon, [BUS_ICON_KEY]: busIcon }} />

      {children}

      <GeoJSONSource
        data={stopsGeoJSON}
        hitbox={{ top: 10, right: 10, bottom: 10, left: 10 }}
        onPress={(event) => {
          const stopId = event.nativeEvent.features[0]?.properties?.stop_id;
          if (stopId) router.push(`/stop/${stopId}`);
        }}
      >
        <Layer
          type="symbol"
          layout={{
            "icon-image": STOP_ICON_KEY,
            "icon-size": 0.16,
            "icon-allow-overlap": true,
          }}
        />
      </GeoJSONSource>

      <GeoJSONSource data={vehiclesGeoJSON}>
        <Layer
          type="symbol"
          layout={{
            "icon-image": BUS_ICON_KEY,
            "icon-size": 0.18,
            "icon-allow-overlap": true,
            "text-field": ["get", "route_number"],
            "text-size": 10,
            "text-offset": [0, 0.9],
            "text-allow-overlap": true,
          }}
          paint={{
            "text-color": "#ffffff",
            "text-halo-color": "#003333",
            "text-halo-width": 1.5,
          }}
        />
      </GeoJSONSource>
    </Map>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  missingKeyText: { textAlign: "center", color: "#666", fontSize: 14 },
});
