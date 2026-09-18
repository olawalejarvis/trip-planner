import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";

import { api } from "../../src/api/client";
import { AddressAutocomplete } from "../../src/components/AddressAutocomplete";
import { ItineraryCard } from "../../src/components/ItineraryCard";
import type { Itinerary, PlaceSuggestion } from "../../src/api/types";
import { useCurrentLocation } from "../../src/hooks/useCurrentLocation";
import { dateLabel, dateToSecondsSinceMidnight, dateToYYYYMMDD, secondsToClockLabel } from "../../src/util/time";

type TimeMode = "now" | "depart" | "arrive";

export default function PlanScreen() {
  const router = useRouter();
  const { coords } = useCurrentLocation();

  const currentLocationOption: PlaceSuggestion | null = useMemo(
    () => (coords ? { label: "Current location", lat: coords.lat, lng: coords.lng, kind: "current_location" } : null),
    [coords],
  );

  const [origin, setOrigin] = useState<PlaceSuggestion | null>(null);
  const [destination, setDestination] = useState<PlaceSuggestion | null>(null);
  const [timeMode, setTimeMode] = useState<TimeMode>("now");
  const [time, setTime] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [itineraries, setItineraries] = useState<Itinerary[] | null>(null);
  const [searchedPoints, setSearchedPoints] = useState<{ origin: PlaceSuggestion; destination: PlaceSuggestion } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveOrigin = origin ?? currentLocationOption;

  async function handlePlan() {
    if (!effectiveOrigin || !destination) {
      setError("Choose both a starting point and a destination.");
      return;
    }
    setLoading(true);
    setError(null);
    setItineraries(null);

    const date = dateToYYYYMMDD(timeMode === "now" ? new Date() : time);
    const timeArgs =
      timeMode === "arrive"
        ? { arriveBy: dateToSecondsSinceMidnight(time) }
        : { departAt: timeMode === "now" ? dateToSecondsSinceMidnight(new Date()) : dateToSecondsSinceMidnight(time) };

    try {
      const response = await api.tripPlan({
        fromLat: effectiveOrigin.lat,
        fromLng: effectiveOrigin.lng,
        toLat: destination.lat,
        toLng: destination.lng,
        date,
        ...timeArgs,
      });
      setItineraries(response.itineraries);
      setSearchedPoints({ origin: effectiveOrigin, destination });
      if (response.itineraries.length === 0) {
        setError("No routes found for this trip. Try a different time or destination.");
      }
    } catch {
      setError("Could not reach the trip planner. Is the API running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <AddressAutocomplete
        label="From"
        placeholder="Current location"
        value={origin}
        onChange={setOrigin}
        currentLocationOption={currentLocationOption}
      />
      <AddressAutocomplete label="To" placeholder="Where are you going?" value={destination} onChange={setDestination} />

      <View style={styles.modeRow}>
        {(["now", "depart", "arrive"] as TimeMode[]).map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.modeButton, timeMode === mode && styles.modeButtonActive]}
            onPress={() => setTimeMode(mode)}
          >
            <Text style={[styles.modeButtonText, timeMode === mode && styles.modeButtonTextActive]}>
              {mode === "now" ? "Leave now" : mode === "depart" ? "Leave at" : "Arrive by"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {timeMode !== "now" && (
        <View style={styles.dateTimeRow}>
          <TouchableOpacity style={[styles.timeButton, styles.dateTimeButton]} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.timeButtonText}>{dateLabel(time)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.timeButton, styles.dateTimeButton]} onPress={() => setShowTimePicker(true)}>
            <Text style={styles.timeButtonText}>{secondsToClockLabel(dateToSecondsSinceMidnight(time))}</Text>
          </TouchableOpacity>
        </View>
      )}
      {showDatePicker && (
        <DateTimePicker
          value={time}
          mode="date"
          minimumDate={new Date()}
          onChange={(_event, selectedDate) => {
            setShowDatePicker(false);
            if (selectedDate) {
              setTime(
                (prev) =>
                  new Date(
                    selectedDate.getFullYear(),
                    selectedDate.getMonth(),
                    selectedDate.getDate(),
                    prev.getHours(),
                    prev.getMinutes(),
                  ),
              );
            }
          }}
        />
      )}
      {showTimePicker && (
        <DateTimePicker
          value={time}
          mode="time"
          is24Hour={false}
          onChange={(_event, selectedDate) => {
            setShowTimePicker(false);
            if (selectedDate) {
              setTime(
                (prev) =>
                  new Date(
                    prev.getFullYear(),
                    prev.getMonth(),
                    prev.getDate(),
                    selectedDate.getHours(),
                    selectedDate.getMinutes(),
                  ),
              );
            }
          }}
        />
      )}

      <View style={styles.submitButton}>
        <Button title="Find trips" onPress={handlePlan} disabled={loading} />
      </View>

      {loading && <ActivityIndicator style={styles.loading} />}
      {error && <Text style={styles.errorText}>{error}</Text>}

      {itineraries?.map((itinerary, idx) => (
        <ItineraryCard
          key={idx}
          itinerary={itinerary}
          onPress={() => {
            if (!searchedPoints) return;
            router.push({
              pathname: "/itinerary",
              params: {
                data: JSON.stringify({
                  itinerary,
                  origin: { lat: searchedPoints.origin.lat, lng: searchedPoints.origin.lng, label: searchedPoints.origin.label },
                  destination: {
                    lat: searchedPoints.destination.lat,
                    lng: searchedPoints.destination.lng,
                    label: searchedPoints.destination.label,
                  },
                }),
              },
            });
          }}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: "#fff", flexGrow: 1 },
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  modeButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ccc",
    alignItems: "center",
  },
  modeButtonActive: { backgroundColor: "#003333", borderColor: "#003333" },
  modeButtonText: { fontSize: 13, color: "#333" },
  modeButtonTextActive: { color: "#fff", fontWeight: "600" },
  dateTimeRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  dateTimeButton: { flex: 1, marginBottom: 0 },
  timeButton: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    marginBottom: 12,
  },
  timeButtonText: { fontSize: 15, fontWeight: "600" },
  submitButton: { marginBottom: 16 },
  loading: { marginBottom: 12 },
  errorText: { color: "#b00020", marginBottom: 12 },
});
