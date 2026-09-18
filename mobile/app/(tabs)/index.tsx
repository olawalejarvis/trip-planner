import { useEffect, useMemo, useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { LngLat } from "@maplibre/maplibre-react-native";

import { api } from "../../src/api/client";
import { walkingRoute } from "../../src/api/directions";
import { AddressAutocomplete } from "../../src/components/AddressAutocomplete";
import { ItineraryCard } from "../../src/components/ItineraryCard";
import type { Itinerary, PlaceSuggestion } from "../../src/api/types";
import { useCurrentLocation } from "../../src/hooks/useCurrentLocation";
import { dateLabel, dateToSecondsSinceMidnight, dateToYYYYMMDD, secondsToClockLabel } from "../../src/util/time";
import { favorites, savedItineraries, type FavoriteTrip, type SavedItinerary } from "../../src/storage/savedTrips";

type TimeMode = "now" | "depart" | "arrive";

/** Real road-following paths for each walk leg, fetched once at save time
 * (same OSRM call the itinerary screen makes live) so a saved trip already
 * has them on reopen instead of depending on network access again. */
async function computeWalkRoutes(
  itinerary: Itinerary,
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): Promise<Record<number, LngLat[]>> {
  const stopIds = new Set<string>();
  for (const leg of itinerary.legs) {
    if (leg.kind !== "walk") continue;
    if (leg.from_stop) stopIds.add(leg.from_stop);
    if (leg.to_stop) stopIds.add(leg.to_stop);
  }

  const stopCoords: Record<string, { lat: number; lng: number }> = {};
  await Promise.all(
    [...stopIds].map((id) =>
      api
        .stop(id)
        .then((s) => {
          stopCoords[id] = { lat: s.lat, lng: s.lng };
        })
        .catch(() => {}),
    ),
  );

  const pointFor = (stopId: string | null, fallback: { lat: number; lng: number }): LngLat => {
    const p = stopId ? stopCoords[stopId] : undefined;
    return p ? [p.lng, p.lat] : [fallback.lng, fallback.lat];
  };

  const routes: Record<number, LngLat[]> = {};
  await Promise.all(
    itinerary.legs.map(async (leg, idx) => {
      if (leg.kind !== "walk") return;
      routes[idx] = await walkingRoute(pointFor(leg.from_stop, origin), pointFor(leg.to_stop, destination));
    }),
  );
  return routes;
}

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
  const [searchedPoints, setSearchedPoints] = useState<
    { origin: PlaceSuggestion; destination: PlaceSuggestion; date: string } | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [favoriteList, setFavoriteList] = useState<FavoriteTrip[]>([]);
  const [savedList, setSavedList] = useState<SavedItinerary[]>([]);
  const [savedIndices, setSavedIndices] = useState<Set<number>>(new Set());

  useEffect(() => {
    favorites.list().then(setFavoriteList);
    savedItineraries.list().then(setSavedList);
  }, []);

  const effectiveOrigin = origin ?? currentLocationOption;

  async function handlePlan() {
    if (!effectiveOrigin || !destination) {
      setError("Choose both a starting point and a destination.");
      return;
    }
    setLoading(true);
    setError(null);
    setItineraries(null);
    setSavedIndices(new Set());

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
      setSearchedPoints({ origin: effectiveOrigin, destination, date });
      if (response.itineraries.length === 0) {
        setError("No routes found for this trip. Try a different time or destination.");
      }
    } catch {
      setError("Could not reach the trip planner. Is the API running?");
    } finally {
      setLoading(false);
    }
  }

  function selectFavorite(favorite: FavoriteTrip) {
    setOrigin(favorite.origin);
    setDestination(favorite.destination);
  }

  async function handleAddFavorite() {
    if (!effectiveOrigin || !destination) return;
    const label = `${effectiveOrigin.label} → ${destination.label}`;
    setFavoriteList(await favorites.add(label, effectiveOrigin, destination));
  }

  async function handleRemoveFavorite(id: string) {
    setFavoriteList(await favorites.remove(id));
  }

  async function handleSaveItinerary(itinerary: Itinerary, idx: number) {
    if (!searchedPoints) return;
    const walkRoutes = await computeWalkRoutes(itinerary, searchedPoints.origin, searchedPoints.destination);
    setSavedList(
      await savedItineraries.add(
        itinerary,
        searchedPoints.origin,
        searchedPoints.destination,
        searchedPoints.date,
        walkRoutes,
      ),
    );
    setSavedIndices((prev) => new Set(prev).add(idx));
  }

  async function handleRemoveSavedItinerary(id: string) {
    setSavedList(await savedItineraries.remove(id));
  }

  function openSavedItinerary(saved: SavedItinerary) {
    router.push({
      pathname: "/itinerary",
      params: {
        data: JSON.stringify({
          itinerary: saved.itinerary,
          origin: saved.origin,
          destination: saved.destination,
          walkRoutes: saved.walkRoutes,
        }),
      },
    });
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {favoriteList.length > 0 && (
        <View style={styles.favoritesRow}>
          {favoriteList.map((favorite) => (
            <View key={favorite.id} style={styles.favoriteChip}>
              <TouchableOpacity onPress={() => selectFavorite(favorite)}>
                <Text style={styles.favoriteChipText}>{favorite.label}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleRemoveFavorite(favorite.id)} hitSlop={8}>
                <Ionicons name="close" size={14} color="#666" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

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

      <View style={styles.submitRow}>
        <View style={styles.submitButton}>
          <Button title="Find trips" onPress={handlePlan} disabled={loading} />
        </View>
        {effectiveOrigin && destination && (
          <TouchableOpacity style={styles.favoriteStar} onPress={handleAddFavorite} hitSlop={8}>
            <Ionicons name="star-outline" size={22} color="#003333" />
          </TouchableOpacity>
        )}
      </View>

      {loading && <ActivityIndicator style={styles.loading} />}
      {error && <Text style={styles.errorText}>{error}</Text>}

      {itineraries?.map((itinerary, idx) => (
        <ItineraryCard
          key={idx}
          itinerary={itinerary}
          saved={savedIndices.has(idx)}
          onSave={() => handleSaveItinerary(itinerary, idx)}
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

      {savedList.length > 0 && (
        <View style={styles.savedSection}>
          <Text style={styles.savedHeading}>Saved trips</Text>
          {savedList.map((saved) => (
            <View key={saved.id} style={styles.savedRow}>
              <TouchableOpacity style={styles.savedRowMain} onPress={() => openSavedItinerary(saved)}>
                <Text style={styles.savedRowText}>
                  {saved.origin.label} → {saved.destination.label}
                </Text>
                <Text style={styles.savedRowMeta}>
                  {saved.date} · {secondsToClockLabel(saved.itinerary.depart_time)} →{" "}
                  {secondsToClockLabel(saved.itinerary.arrival_time)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleRemoveSavedItinerary(saved.id)} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color="#b00020" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
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
  submitRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  submitButton: { flex: 1, marginBottom: 16 },
  favoriteStar: { marginBottom: 16 },
  loading: { marginBottom: 12 },
  errorText: { color: "#b00020", marginBottom: 12 },
  favoritesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  favoriteChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    backgroundColor: "#e6f0f0",
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  favoriteChipText: { fontSize: 13, color: "#003333", fontWeight: "600" },
  savedSection: { marginTop: 8 },
  savedHeading: { fontSize: 15, fontWeight: "700", marginBottom: 8, color: "#333" },
  savedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  savedRowMain: { flex: 1, marginRight: 8 },
  savedRowText: { fontSize: 14, fontWeight: "600", color: "#333" },
  savedRowMeta: { fontSize: 12, color: "#888", marginTop: 2 },
});
