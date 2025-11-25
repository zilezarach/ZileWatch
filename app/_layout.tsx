import { Stack } from "expo-router";
import { useEffect } from "react";
import { cacheCleaner } from "@/utils/CacheManager";

export default function RootLayout() {
  useEffect(() => {
    cacheCleaner.performClean();
  }, []);
  return (
    <Stack>
      {/* Tabs group */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
