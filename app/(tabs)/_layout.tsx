import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import { MaterialIcons, FontAwesome5 } from "@expo/vector-icons";
import { DownloadContext } from "@/context/DownloadContext";
import { MiniPlayerProvider } from "@/context/MiniPlayerContext";
import MiniPlayer from "../../components/MiniPlayer";
import * as FileSystem from "expo-file-system";
import { ErrorBoundary } from "@/components/ErrorBoundary";

type ActiveDownload = { title: string; progress: number };
type CompletedDownload = { id: string; title: string };

export default function Layout() {
  const [activeDownloads, setActiveDownloads] = useState<
    Record<string, ActiveDownload>
  >({});
  const [completeDownloads, setCompleteDownloads] = useState<
    CompletedDownload[]
  >([]);
  const [resumables, setResumables] = useState<
    Record<string, FileSystem.DownloadResumable>
  >({});

  const DownloadContextValue = React.useMemo(
    () => ({
      activeDownloads,
      setActiveDownloads,
      completeDownloads,
      setCompleteDownloads,
      resumables,
      setResumables,
    }),
    [activeDownloads, completeDownloads, resumables],
  );

  return (
    <ErrorBoundary>
      <DownloadContext.Provider value={DownloadContextValue}>
        <MiniPlayerProvider>
          <View style={styles.container}>
            <Tabs screenOptions={{ headerShown: false }}>
              <Tabs.Screen
                name="Home"
                options={{
                  title: "Home",
                  tabBarIcon: ({ focused, color, size }) => (
                    <MaterialIcons
                      name="home"
                      size={size}
                      color={focused ? "#7d0b02" : color}
                    />
                  ),
                }}
              />
              <Tabs.Screen
                name="Movies"
                options={{
                  title: "Movies",
                  tabBarIcon: ({ focused, color, size }) => (
                    <MaterialIcons
                      name="movie"
                      size={size}
                      color={focused ? "#7d0b02" : color}
                    />
                  ),
                }}
              />
              <Tabs.Screen
                name="Games"
                options={{
                  title: "Sports",
                  tabBarIcon: ({ focused, color, size }) => (
                    <FontAwesome5
                      name="football-ball"
                      size={size}
                      color={focused ? "#7d0b02" : color}
                    />
                  ),
                }}
              />
              <Tabs.Screen
                name="Account"
                options={{
                  title: "Me",
                  tabBarIcon: ({ focused, color, size }) => (
                    <FontAwesome5
                      name="user"
                      size={size}
                      color={focused ? "#7d0b02" : color}
                    />
                  ),
                  tabBarBadge:
                    Object.keys(activeDownloads).length > 0
                      ? Object.keys(activeDownloads).length
                      : undefined,
                }}
              />
              <Tabs.Screen name="index" options={{ href: null }} />
              <Tabs.Screen name="VideoPlayer" options={{ href: null }} />
              <Tabs.Screen name="Stream" options={{ href: null }} />
              <Tabs.Screen name="SeriesDetail" options={{ href: null }} />
              <Tabs.Screen name="EpisodeList" options={{ href: null }} />
              <Tabs.Screen name="MovieDetail" options={{ href: null }} />
              <Tabs.Screen name="LivePlayer" options={{ href: null }} />
            </Tabs>
            <MiniPlayer />
          </View>
        </MiniPlayerProvider>
      </DownloadContext.Provider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#121212" },
});
