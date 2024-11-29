import { Tabs } from "expo-router";
import { MaterialIcons, FontAwesome5 } from "@expo/vector-icons";

export default function Layout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      {/* Home Tab */}
      <Tabs.Screen
        name="Home"
        options={{
          title: "Home",
          tabBarIcon: ({ focused, color, size }) => (
            <MaterialIcons name="home" size={size} color={focused ? "#7d0b02" : color} />
          )
        }}
      />
      {/* Games Tab */}
      <Tabs.Screen
        name="Games"
        options={{
          title: "Games",
          tabBarIcon: ({ focused, color, size }) => (
            <FontAwesome5 name="gamepad" size={size} color={focused ? "#7d0b02" : color} />
          )
        }}
      />
      {/* Movies Tab */}
      <Tabs.Screen
        name="Movies"
        options={{
          title: "Movies",
          tabBarIcon: ({ focused, color, size }) => (
            <MaterialIcons name="movie" size={size} color={focused ? "#7d0b02" : color} />
          )
        }}
      />
      <Tabs.Screen
        name="Account"
        options={{
          title: "Me",
          tabBarIcon: ({ focused, color, size }) => (
            <FontAwesome5 name="user" size={size} color={focused ? "#7d0b02" : color} />
          )
        }}
      />
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="VideoPlayer" options={{ href: null }} />
    </Tabs>
  );
}
