import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { Itinerary, ItineraryLabel } from "../api/types";
import { durationLabel, secondsToClockLabel } from "../util/time";

const LABEL_TEXT: Record<ItineraryLabel, string> = {
  fastest: "Fastest",
  fewest_transfers: "Fewest transfers",
  least_walking: "Least walking",
};

export function ItineraryCard({
  itinerary,
  onPress,
  onSave,
  saved,
}: {
  itinerary: Itinerary;
  onPress?: () => void;
  /** Omit to hide the save affordance entirely (e.g. when re-viewing an already-saved itinerary). */
  onSave?: () => void;
  saved?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7} disabled={!onPress}>
      <View style={styles.badgeRow}>
        {itinerary.labels.map((label) => (
          <View key={label} style={styles.badge}>
            <Text style={styles.badgeText}>{LABEL_TEXT[label]}</Text>
          </View>
        ))}
        {onSave && (
          <TouchableOpacity
            style={styles.saveButton}
            onPress={onSave}
            disabled={saved}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={18} color="#003333" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.summaryRow}>
        <Text style={styles.times}>
          {secondsToClockLabel(itinerary.depart_time)} → {secondsToClockLabel(itinerary.arrival_time)}
        </Text>
        <Text style={styles.duration}>{durationLabel(itinerary.duration_s)}</Text>
      </View>
      <Text style={styles.meta}>
        {itinerary.num_transfers === 0 ? "No transfers" : `${itinerary.num_transfers} transfer(s)`} ·{" "}
        {durationLabel(itinerary.total_walk_s)} walking
      </Text>

      <View style={styles.legs}>
        {itinerary.legs.map((leg, idx) =>
          leg.kind === "walk" ? (
            <View key={idx} style={styles.legRow}>
              <View style={[styles.legIcon, styles.walkIcon]}>
                <Ionicons name="walk" size={13} color="#fff" />
              </View>
              <Text style={styles.legText}>Walk {durationLabel(leg.duration_s)}</Text>
            </View>
          ) : (
            <View key={idx} style={styles.legRow}>
              <View style={[styles.legIcon, styles.busIcon]}>
                <MaterialCommunityIcons name="bus" size={13} color="#fff" />
              </View>
              <Text style={styles.legText}>
                Route {leg.route_id} · {leg.headsign ?? ""} · board {secondsToClockLabel(leg.board_time)}, alight{" "}
                {secondsToClockLabel(leg.alight_time)}
              </Text>
            </View>
          ),
        )}
      </View>

      {onPress && (
        <View style={styles.detailHint}>
          <Text style={styles.detailHintText}>View step-by-step & map</Text>
          <Ionicons name="chevron-forward" size={15} color="#003333" />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    backgroundColor: "#fff",
  },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 8 },
  saveButton: { marginLeft: "auto" },
  badge: { backgroundColor: "#e6f4ea", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: "700", color: "#0a7d2c" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  times: { fontSize: 17, fontWeight: "700" },
  duration: { fontSize: 15, color: "#555" },
  meta: { fontSize: 13, color: "#888", marginTop: 2, marginBottom: 8 },
  legs: { gap: 6 },
  legRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  legIcon: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  walkIcon: { backgroundColor: "#5f6b6b" },
  busIcon: { backgroundColor: "#1565c0" },
  legText: { fontSize: 13, color: "#333", flex: 1 },
  detailHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  detailHintText: { fontSize: 12, fontWeight: "600", color: "#003333" },
});
