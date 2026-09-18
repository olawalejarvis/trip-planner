import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { api } from "../api/client";
import { geocodeSearch } from "../api/geocode";
import type { PlaceSuggestion } from "../api/types";

interface Props {
  label: string;
  placeholder?: string;
  value: PlaceSuggestion | null;
  onChange: (place: PlaceSuggestion | null) => void;
  // A ready-made "current location" suggestion, offered when the field is empty and focused.
  currentLocationOption?: PlaceSuggestion | null;
}

export function AddressAutocomplete({ label, placeholder, value, onChange, currentLocationOption }: Props) {
  const [text, setText] = useState(value?.label ?? "");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setText(value?.label ?? "");
  }, [value]);

  function handleChangeText(newText: string) {
    setText(newText);
    onChange(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (newText.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const [stops, addresses] = await Promise.all([
          api.searchStops(newText).catch(() => []),
          geocodeSearch(newText).catch(() => []),
        ]);
        const stopSuggestions: PlaceSuggestion[] = stops.map((s) => ({
          label: s.name,
          sublabel: "Bus stop",
          lat: s.lat,
          lng: s.lng,
          kind: "stop" as const,
        }));
        setSuggestions([...stopSuggestions, ...addresses]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  function handleSelect(place: PlaceSuggestion) {
    setText(place.label);
    setSuggestions([]);
    setFocused(false);
    onChange(place);
  }

  const showCurrentLocation = focused && text.length === 0 && !!currentLocationOption;
  const showDropdown = focused && (suggestions.length > 0 || loading || showCurrentLocation);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        value={text}
        onChangeText={handleChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
      />
      {showDropdown && (
        <View style={styles.dropdown}>
          {loading && <ActivityIndicator style={styles.loading} />}
          {showCurrentLocation && currentLocationOption && (
            <TouchableOpacity style={styles.suggestion} onPress={() => handleSelect(currentLocationOption)}>
              <Text style={styles.suggestionLabel}>📍 Current location</Text>
            </TouchableOpacity>
          )}
          {suggestions.map((item, idx) => (
            <TouchableOpacity
              key={`${item.kind}-${item.label}-${idx}`}
              style={styles.suggestion}
              onPress={() => handleSelect(item)}
            >
              <Text style={styles.suggestionLabel}>{item.label}</Text>
              {item.sublabel && <Text style={styles.suggestionSublabel}>{item.sublabel}</Text>}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 12, zIndex: 1 },
  label: { fontSize: 13, fontWeight: "600", color: "#555", marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  dropdown: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    marginTop: 4,
    backgroundColor: "#fff",
  },
  loading: { padding: 8 },
  suggestion: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#eee" },
  suggestionLabel: { fontSize: 15 },
  suggestionSublabel: { fontSize: 12, color: "#888", marginTop: 2 },
});
