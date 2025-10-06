import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#fff" },
        headerTintColor: "#000",
        headerTitleStyle: { fontWeight: "600", fontSize: 18 },
        animation: "slide_from_right",
      }}
    >
      {/* Tabs group */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

      {/* Modals / fullscreen screens */}
      <Stack.Screen
        name="(tabs)/StreamVideo"
        options={{
          title: "Movie Player",
          presentation: "modal",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="(tabs)/VideoPlayer"
        options={{
          title: " YT Player",
          presentation: "fullScreenModal",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="(tabs)/PlayerScreen"
        options={{
          title: "Live Player",
          presentation: "modal",
          headerStyle: { backgroundColor: "#000" },
          headerTintColor: "#fff",
        }}
      />
    </Stack>
  );
}
