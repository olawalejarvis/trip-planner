import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";

import { api } from "../../src/api/client";
import type { Departure, StopSummary } from "../../src/api/types";
import { hhmmssToClockLabel } from "../../src/util/time";

const REFRESH_INTERVAL_MS = 20_000;

export default function StopScreen() {
  const { stopId } = useLocalSearchParams<{ stopId: string }>();
  const navigation = useNavigation();
  const [stop, setStop] = useState<StopSummary | null>(null);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!stopId) return;
    try {
      const [stopInfo, deps] = await Promise.all([api.stop(stopId), api.stopDepartures(stopId)]);
      setStop(stopInfo);
      setDepartures(deps);
      setError(null);
      navigation.setOptions({ title: stopInfo.name });
    } catch {
      setError("Could not load stop information.");
    } finally {
      setLoading(false);
    }
  }, [stopId, navigation]);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={departures}
      keyExtractor={(item, idx) => `${item.route_id}-${item.scheduled_departure}-${idx}`}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
      ListHeaderComponent={
        stop ? (
          <View style={styles.header}>
            <Text style={styles.stopName}>{stop.name}</Text>
            <Text style={styles.stopMeta}>Stop {stop.code ?? stop.stop_id}</Text>
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View style={styles.center}>
          <Text>{error ?? "No upcoming departures found."}</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.routeBadge}>
            <Text style={styles.routeBadgeText}>{item.route_short_name ?? item.route_id}</Text>
          </View>
          <View style={styles.rowText}>
            <Text style={styles.headsign}>{item.trip_headsign ?? `Route ${item.route_id}`}</Text>
            {item.realtime && item.vehicle ? (
              <Text style={styles.liveText}>
                🟢 Live · {item.vehicle.deviation ?? "on time"} · {item.vehicle.current_location}
              </Text>
            ) : (
              <Text style={styles.scheduledText}>Scheduled</Text>
            )}
          </View>
          <Text style={styles.time}>
            {item.scheduled_departure ? hhmmssToClockLabel(item.scheduled_departure) : "--"}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#eee" },
  stopName: { fontSize: 20, fontWeight: "700" },
  stopMeta: { fontSize: 13, color: "#888", marginTop: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    gap: 12,
  },
  routeBadge: {
    minWidth: 36,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#003333",
    alignItems: "center",
  },
  routeBadgeText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  rowText: { flex: 1 },
  headsign: { fontSize: 15, fontWeight: "500" },
  liveText: { fontSize: 12, color: "#0a7d2c", marginTop: 2 },
  scheduledText: { fontSize: 12, color: "#888", marginTop: 2 },
  time: { fontSize: 15, fontWeight: "600" },
});
