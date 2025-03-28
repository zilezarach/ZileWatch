import React, { createContext, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import { MaterialIcons, FontAwesome5 } from "@expo/vector-icons";
import MiniPlayer from "../../components/MiniPlayer";
import { MiniPlayerProvider } from "../../context/MiniPlayerContext";
// Type definitions
type ActiveDownload = {
  title: string;
  progress: number;
};

type CompletedDownload = {
  id: string;
  title: string;
};

type DownloadContextType = {
  activeDownloads: Record<string, ActiveDownload>;
  setActiveDownloads: React.Dispatch<
    React.SetStateAction<Record<string, ActiveDownload>>
  >;
  completeDownloads: CompletedDownload[];
  setCompleteDownloads: React.Dispatch<
    React.SetStateAction<CompletedDownload[]>
  >;
};

// Create Download Context with default values
const DownloadContext = createContext<DownloadContextType>({
  activeDownloads: {},
  setActiveDownloads: () => {
    console.warn("setActiveDownloads is not initialized!");
  },
  completeDownloads: [],
  setCompleteDownloads: () => {
    console.warn("setCompleteDownloads is not initialized!");
  },
});

export default function Layout() {
  const [activeDownloads, setActiveDownloads] = useState<
    Record<string, ActiveDownload>
  >({});
  const [completeDownloads, setCompleteDownloads] = useState<
    CompletedDownload[]
  >([]);

  return (
    <DownloadContext.Provider
      value={{
        activeDownloads,
        setActiveDownloads,
        completeDownloads,
        setCompleteDownloads,
      }}
    >
      <MiniPlayerProvider>
        <View style={styles.container}>
          <Tabs screenOptions={{ headerShown: false }}>
            {/* Home Tab */}
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
            {/* Games Tab */}
            <Tabs.Screen
              name="Games"
              options={{
                title: "Games",
                tabBarIcon: ({ focused, color, size }) => (
                  <FontAwesome5
                    name="gamepad"
                    size={size}
                    color={focused ? "#7d0b02" : color}
                  />
                ),
              }}
            />
            {/* Movies Tab */}
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
          </Tabs>
          {/* Persistent MiniPlayer, visible on all screens */}
          <MiniPlayer />
        </View>
      </MiniPlayerProvider>
    </DownloadContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  headerContainer: {
    flex: 1,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
});

export { DownloadContext };
