import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { GeoJSONSource, Layer, Marker, type LngLat } from "@maplibre/maplibre-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "../src/api/client";
import { walkingRoute } from "../src/api/directions";
import { TransitMap } from "../src/components/TransitMap";
import type { Itinerary, RouteSummary } from "../src/api/types";
import { trimShapeToSegment } from "../src/util/geo";
import { durationLabel, secondsToClockLabel } from "../src/util/time";

interface Point {
  lat: number;
  lng: number;
}

type WaypointRole = "origin" | "board" | "alight" | "destination";

function waypointIcon(role: WaypointRole): ComponentProps<typeof Ionicons>["name"] {
  switch (role) {
    case "origin":
      return "navigate";
    case "board":
      return "arrow-up";
    case "alight":
      return "arrow-down";
    case "destination":
      return "flag";
  }
}

function waypointStyle(role: WaypointRole, routeColor?: string) {
  switch (role) {
    case "origin":
      return { backgroundColor: "#2e7d32" };
    case "board":
      return { backgroundColor: routeColor ?? "#1565c0" };
    case "alight":
      return { backgroundColor: "#455a64" };
    case "destination":
      return { backgroundColor: "#c62828" };
  }
}

interface NavParams {
  itinerary: Itinerary;
  origin: Point & { label: string };
  destination: Point & { label: string };
}

export default function ItineraryScreen() {
  const insets = useSafeAreaInsets();
  const { data } = useLocalSearchParams<{ data: string }>();
  const parsed = useMemo<NavParams | null>(() => {
    try {
      return data ? (JSON.parse(data) as NavParams) : null;
    } catch {
      return null;
    }
  }, [data]);

  const [stopCoords, setStopCoords] = useState<Record<string, Point>>({});
  const [stopNames, setStopNames] = useState<Record<string, string>>({});
  const [routeInfo, setRouteInfo] = useState<Record<string, RouteSummary>>({});
  const [tripShapes, setTripShapes] = useState<Record<string, LngLat[]>>({});
  const [walkRoutes, setWalkRoutes] = useState<Record<number, LngLat[]>>({});
  const [loading, setLoading] = useState(true);
  const [directionsExpanded, setDirectionsExpanded] = useState(true);

  useEffect(() => {
    if (!parsed) {
      setLoading(false);
      return;
    }

    const stopIds = new Set<string>();
    const routeIds = new Set<string>();
    const tripIds = new Set<string>();
    for (const leg of parsed.itinerary.legs) {
      if (leg.kind === "walk") {
        if (leg.from_stop) stopIds.add(leg.from_stop);
        if (leg.to_stop) stopIds.add(leg.to_stop);
      } else {
        stopIds.add(leg.board_stop);
        stopIds.add(leg.alight_stop);
        routeIds.add(leg.route_id);
        tripIds.add(leg.trip_id);
      }
    }

    Promise.all([
      Promise.all([...stopIds].map((id) => api.stop(id).then((s) => [id, s] as const).catch(() => null))),
      Promise.all([...routeIds].map((id) => api.route(id).then((r) => [id, r] as const).catch(() => null))),
      Promise.all([...tripIds].map((id) => api.tripShape(id).then((s) => [id, s] as const).catch(() => null))),
    ]).then(([stopResults, routeResults, shapeResults]) => {
      const coords: Record<string, Point> = {};
      const names: Record<string, string> = {};
      for (const entry of stopResults) {
        if (!entry) continue;
        const [id, stop] = entry;
        coords[id] = { lat: stop.lat, lng: stop.lng };
        names[id] = stop.name;
      }
      const routes: Record<string, RouteSummary> = {};
      for (const entry of routeResults) {
        if (!entry) continue;
        const [id, route] = entry;
        routes[id] = route;
      }
      const shapes: Record<string, LngLat[]> = {};
      for (const entry of shapeResults) {
        if (!entry) continue;
        const [id, shape] = entry;
        shapes[id] = shape.points.map((p) => [p.lng, p.lat]);
      }
      setStopCoords(coords);
      setStopNames(names);
      setRouteInfo(routes);
      setTripShapes(shapes);
      setLoading(false);
    });
  }, [parsed]);

  useEffect(() => {
    if (!parsed || loading) return;

    const pointFor = (stopId: string | null, fallback: Point): Point =>
      stopId ? (stopCoords[stopId] ?? fallback) : fallback;

    Promise.all(
      parsed.itinerary.legs.map(async (leg, idx) => {
        if (leg.kind !== "walk") return null;
        const from = pointFor(leg.from_stop, parsed.origin);
        const to = pointFor(leg.to_stop, parsed.destination);
        const route = await walkingRoute([from.lng, from.lat], [to.lng, to.lat]);
        return [idx, route] as const;
      }),
    ).then((results) => {
      const routes: Record<number, LngLat[]> = {};
      for (const entry of results) {
        if (entry) routes[entry[0]] = entry[1];
      }
      setWalkRoutes(routes);
    });
    // stopCoords is populated once, right before loading flips false, and pointFor closes over
    // it fresh each run -- depending on `loading` alone avoids refetching on unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, loading]);

  if (!parsed) {
    return (
      <View style={styles.center}>
        <Text>Could not load this trip's details.</Text>
      </View>
    );
  }

  const { itinerary, origin, destination } = parsed;

  const pointFor = (stopId: string | null, fallback: Point): Point =>
    stopId ? (stopCoords[stopId] ?? fallback) : fallback;

  const allPoints: Point[] = [
    origin,
    destination,
    ...Object.values(stopCoords),
  ];
  const center: LngLat =
    allPoints.length > 0
      ? [
          (Math.min(...allPoints.map((p) => p.lng)) + Math.max(...allPoints.map((p) => p.lng))) / 2,
          (Math.min(...allPoints.map((p) => p.lat)) + Math.max(...allPoints.map((p) => p.lat))) / 2,
        ]
      : [origin.lng, origin.lat];

  const waypoints: { point: Point; role: "origin" | "board" | "alight" | "destination"; routeColor?: string }[] = [
    { point: origin, role: "origin" },
  ];
  for (const leg of itinerary.legs) {
    if (leg.kind === "transit") {
      const routeColor = routeInfo[leg.route_id]?.color ? `#${routeInfo[leg.route_id].color}` : "#1565c0";
      waypoints.push({ point: pointFor(leg.board_stop, origin), role: "board", routeColor });
      waypoints.push({ point: pointFor(leg.alight_stop, destination), role: "alight" });
    }
  }
  waypoints.push({ point: destination, role: "destination" });

  return (
    <View style={styles.container}>
      <View style={styles.summary}>
        <Text style={styles.summaryTimes}>
          {secondsToClockLabel(itinerary.depart_time)} → {secondsToClockLabel(itinerary.arrival_time)}
        </Text>
        <Text style={styles.summaryMeta}>
          {durationLabel(itinerary.duration_s)} ·{" "}
          {itinerary.num_transfers === 0 ? "No transfers" : `${itinerary.num_transfers} transfer(s)`} ·{" "}
          {durationLabel(itinerary.total_walk_s)} walking
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <View style={directionsExpanded ? styles.map : styles.mapExpanded}>
          <TransitMap center={center} zoom={13}>
            {itinerary.legs.map((leg, idx) => {
              if (leg.kind === "walk") {
                const from = pointFor(leg.from_stop, origin);
                const to = pointFor(leg.to_stop, destination);
                const coordinates = walkRoutes[idx] ?? [
                  [from.lng, from.lat],
                  [to.lng, to.lat],
                ];
                return (
                  <GeoJSONSource key={idx} data={{ type: "LineString", coordinates }}>
                    <Layer
                      type="line"
                      layout={{ "line-cap": "round" }}
                      paint={{ "line-color": "#1e88e5", "line-width": 3, "line-dasharray": [2, 2] }}
                    />
                  </GeoJSONSource>
                );
              }

              const fullShape = tripShapes[leg.trip_id];
              const color = routeInfo[leg.route_id]?.color ? `#${routeInfo[leg.route_id].color}` : "#1565c0";
              if (!fullShape || fullShape.length < 2) return null;
              const boardPoint = pointFor(leg.board_stop, origin);
              const alightPoint = pointFor(leg.alight_stop, destination);
              const shape = trimShapeToSegment(fullShape, [boardPoint.lng, boardPoint.lat], [alightPoint.lng, alightPoint.lat]);
              return (
                <GeoJSONSource key={idx} data={{ type: "LineString", coordinates: shape }}>
                  <Layer
                    type="line"
                    layout={{ "line-cap": "round", "line-join": "round" }}
                    paint={{ "line-color": color, "line-width": 5 }}
                  />
                </GeoJSONSource>
              );
            })}

            {waypoints.map((wp, idx) => (
              <Marker key={idx} lngLat={[wp.point.lng, wp.point.lat]}>
                <View style={[styles.waypointPin, waypointStyle(wp.role, wp.routeColor)]}>
                  <Ionicons name={waypointIcon(wp.role)} size={16} color="#fff" />
                </View>
              </Marker>
            ))}
          </TransitMap>
        </View>
      )}

      <TouchableOpacity
        style={[styles.directionsHeader, !directionsExpanded && { paddingBottom: 14 + insets.bottom }]}
        onPress={() => setDirectionsExpanded((e) => !e)}
        activeOpacity={0.7}
      >
        <Text style={styles.directionsHeaderText}>Directions</Text>
        <Ionicons name={directionsExpanded ? "chevron-down" : "chevron-up"} size={20} color="#003333" />
      </TouchableOpacity>

      {directionsExpanded && (
        <ScrollView
          style={styles.steps}
          contentContainerStyle={[styles.stepsContent, { paddingBottom: 16 + insets.bottom }]}
        >
          {itinerary.legs.map((leg, idx) =>
            leg.kind === "walk" ? (
              <View key={idx} style={styles.step}>
                <View style={[styles.stepIcon, styles.walkIcon]}>
                  <Ionicons name="walk" size={16} color="#fff" />
                </View>
                <View style={styles.stepText}>
                  <Text style={styles.stepTitle}>
                    Walk {durationLabel(leg.duration_s)} ({Math.round(leg.distance_m)} m)
                  </Text>
                  <Text style={styles.stepSubtitle}>
                    to {leg.to_stop ? (stopNames[leg.to_stop] ?? "next stop") : destination.label}
                  </Text>
                </View>
              </View>
            ) : (
              <View key={idx} style={styles.step}>
                <View
                  style={[
                    styles.stepIcon,
                    { backgroundColor: routeInfo[leg.route_id]?.color ? `#${routeInfo[leg.route_id].color}` : "#1565c0" },
                  ]}
                >
                  <MaterialCommunityIcons name="bus" size={16} color="#fff" />
                </View>
                <View style={styles.stepText}>
                  <Text style={styles.stepTitle}>
                    Route {leg.route_id} · {leg.headsign ?? ""}
                  </Text>
                  <Text style={styles.stepSubtitle}>
                    Board {stopNames[leg.board_stop] ?? leg.board_stop} at {secondsToClockLabel(leg.board_time)}
                  </Text>
                  <Text style={styles.stepSubtitle}>
                    Alight {stopNames[leg.alight_stop] ?? leg.alight_stop} at {secondsToClockLabel(leg.alight_time)}
                  </Text>
                </View>
              </View>
            ),
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  summary: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#eee" },
  summaryTimes: { fontSize: 20, fontWeight: "700" },
  summaryMeta: { fontSize: 13, color: "#666", marginTop: 4 },
  loading: { marginVertical: 40 },
  map: { height: 260 },
  mapExpanded: { flex: 1 },
  directionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    backgroundColor: "#fff",
  },
  directionsHeaderText: { fontSize: 15, fontWeight: "700", color: "#003333" },
  steps: { flex: 1 },
  stepsContent: { padding: 16, gap: 16 },
  step: { flexDirection: "row", gap: 12 },
  stepIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  walkIcon: { backgroundColor: "#5f6b6b" },
  stepText: { flex: 1 },
  stepTitle: { fontSize: 15, fontWeight: "700" },
  stepSubtitle: { fontSize: 13, color: "#555", marginTop: 2 },
  waypointPin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
});
