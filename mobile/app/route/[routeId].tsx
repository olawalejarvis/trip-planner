import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { Camera, GeoJSONSource, Layer, Map, type LngLat } from "@maplibre/maplibre-react-native";

import { api } from "../../src/api/client";
import { MAPTILER_STYLE_URL } from "../../src/config";
import type { RouteShape, RouteSummary } from "../../src/api/types";

export default function RouteScreen() {
  const { routeId } = useLocalSearchParams<{ routeId: string }>();
  const navigation = useNavigation();
  const [route, setRoute] = useState<RouteSummary | null>(null);
  const [shape, setShape] = useState<RouteShape | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!routeId) return;
    Promise.all([api.route(routeId), api.routeShape(routeId)])
      .then(([routeInfo, shapeInfo]) => {
        setRoute(routeInfo);
        setShape(shapeInfo);
        navigation.setOptions({ title: `Route ${routeInfo.short_name ?? routeInfo.route_id}` });
      })
      .finally(() => setLoading(false));
  }, [routeId, navigation]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const coordinates: LngLat[] = shape?.points.map((p) => [p.lng, p.lat]) ?? [];
  const center = coordinates.length > 0 ? boundingBoxCenter(coordinates) : ([-52.7407, 47.5675] as LngLat);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.routeName}>{route?.long_name ?? "Unknown route"}</Text>
        <Text style={styles.routeMeta}>Route {route?.short_name ?? route?.route_id}</Text>
      </View>

      {MAPTILER_STYLE_URL && coordinates.length > 1 ? (
        <Map mapStyle={MAPTILER_STYLE_URL} style={styles.map}>
          <Camera center={center} zoom={12} />
          <GeoJSONSource data={{ type: "LineString", coordinates }}>
            <Layer
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{ "line-color": route?.color ? `#${route.color}` : "#003333", "line-width": 4 }}
            />
          </GeoJSONSource>
        </Map>
      ) : (
        <View style={styles.center}>
          <Text style={styles.noShapeText}>
            {MAPTILER_STYLE_URL ? "No shape data available for this route." : "Map unavailable (no MapTiler key set)."}
          </Text>
        </View>
      )}
    </View>
  );
}

function boundingBoxCenter(coordinates: LngLat[]): LngLat {
  const lngs = coordinates.map((c) => c[0]);
  const lats = coordinates.map((c) => c[1]);
  return [(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#eee" },
  routeName: { fontSize: 18, fontWeight: "700" },
  routeMeta: { fontSize: 13, color: "#888", marginTop: 2 },
  map: { flex: 1 },
  noShapeText: { textAlign: "center", color: "#666" },
});
