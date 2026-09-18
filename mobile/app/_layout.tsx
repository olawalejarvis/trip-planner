import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="stop/[stopId]" options={{ title: "Stop" }} />
      <Stack.Screen name="route/[routeId]" options={{ title: "Route" }} />
      <Stack.Screen name="itinerary" options={{ title: "Trip Details" }} />
    </Stack>
  );
}
