import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerTitleAlign: "center", tabBarStyle: { display: "none" } }}>
      <Tabs.Screen
        name="index"
        options={{
          title: "Plan a Trip",
          tabBarIcon: ({ color, size }) => <Ionicons name="navigate" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="nearby"
        options={{
          title: "Nearby",
          tabBarIcon: ({ color, size }) => <Ionicons name="list" color={color} size={size} />,
          href: null, // Hidden for now -- remove this line to bring the tab back.
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: "Map",
          tabBarIcon: ({ color, size }) => <Ionicons name="map" color={color} size={size} />,
          href: null, // Hidden for now -- remove this line to bring the tab back.
        }}
      />
    </Tabs>
  );
}
