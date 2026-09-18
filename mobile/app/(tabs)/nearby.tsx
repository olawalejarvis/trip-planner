import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { api } from "../../src/api/client";
import type { NearbyStop } from "../../src/api/types";
import { useCurrentLocation } from "../../src/hooks/useCurrentLocation";

export default function NearbyScreen() {
  const router = useRouter();
  const { coords, error: locationError, loading: locationLoading } = useCurrentLocation();
  const [stops, setStops] = useState<NearbyStop[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!coords) return;
    setLoading(true);
    setError(null);
    try {
      const results = await api.nearbyStops(coords.lat, coords.lng, 800);
      setStops(results);
    } catch {
      setError("Could not load nearby stops. Is the API reachable?");
    } finally {
      setLoading(false);
    }
  }, [coords]);

  useEffect(() => {
    load();
  }, [load]);

  if (locationLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (locationError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{locationError}</Text>
        <Text style={styles.hintText}>Enable location access to see stops near you.</Text>
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={stops}
      keyExtractor={(item) => item.stop_id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      ListEmptyComponent={
        !loading ? (
          <View style={styles.center}>
            <Text>{error ?? "No stops found within 800m."}</Text>
          </View>
        ) : null
      }
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.row} onPress={() => router.push(`/stop/${item.stop_id}`)}>
          <View style={styles.rowText}>
            <Text style={styles.stopName}>{item.name}</Text>
            <Text style={styles.stopMeta}>Stop {item.code ?? item.stop_id}</Text>
          </View>
          <Text style={styles.distance}>{Math.round(item.distance_m)} m</Text>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorText: { fontSize: 16, fontWeight: "600", marginBottom: 6, textAlign: "center" },
  hintText: { fontSize: 14, color: "#666", textAlign: "center" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  rowText: { flex: 1 },
  stopName: { fontSize: 16, fontWeight: "600" },
  stopMeta: { fontSize: 13, color: "#888", marginTop: 2 },
  distance: { fontSize: 14, color: "#555" },
});
