import * as Location from "expo-location";
import { useEffect, useState } from "react";

export interface Coords {
  lat: number;
  lng: number;
}

export interface CurrentLocationState {
  coords: Coords | null;
  error: string | null;
  loading: boolean;
}

export function useCurrentLocation(): CurrentLocationState {
  const [state, setState] = useState<CurrentLocationState>({ coords: null, error: null, loading: true });

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        if (mounted) setState({ coords: null, error: "Location permission denied", loading: false });
        return;
      }
      try {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (mounted) {
          setState({
            coords: { lat: position.coords.latitude, lng: position.coords.longitude },
            error: null,
            loading: false,
          });
        }
      } catch {
        if (mounted) setState({ coords: null, error: "Could not determine location", loading: false });
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return state;
}
