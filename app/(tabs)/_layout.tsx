import React, { createContext, useState, useEffect } from "react";
import { View, StyleSheet, Text, TouchableOpacity } from "react-native";
import { Tabs } from "expo-router";
import { MaterialIcons, FontAwesome5 } from "@expo/vector-icons";
import MiniPlayer from "../../components/MiniPlayer";
import { MiniPlayerProvider } from "../../context/MiniPlayerContext";
import * as FileSystem from "expo-file-system";
// Type definitions
type ActiveDownload = {
  title: string;
  progress: number;
};

type CompletedDownload = {
  id: string;
  title: string;
};

interface ErrorBoundaryState {
  hasError: boolean;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

type DownloadContextType = {
  activeDownloads: Record<string, { title: string; progress: number }>;
  setActiveDownloads: React.Dispatch<
    React.SetStateAction<Record<string, { title: string; progress: number }>>
  >;
  completeDownloads: { id: string; title: string }[];
  setCompleteDownloads: React.Dispatch<
    React.SetStateAction<{ id: string; title: string }[]>
  >;
  resumables: Record<string, FileSystem.DownloadResumable>;
  setResumables: React.Dispatch<
    React.SetStateAction<Record<string, FileSystem.DownloadResumable>>
  >;
};
//Create errorBoundary components
class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Error caught by boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 10 }}>
            Something went wrong!
          </Text>
          <TouchableOpacity
            style={{
              backgroundColor: "#7d0b02",
              padding: 10,
              borderRadius: 5,
              marginTop: 20,
            }}
            onPress={() => this.setState({ hasError: false })}
          >
            <Text style={{ color: "#fff", fontSize: 16 }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

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
  resumables: {}, // ✅ add default empty object
  setResumables: () => {
    console.warn("setResumables is not initialized!");
  },
});

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
    [activeDownloads, completeDownloads],
  );

  return (
    <ErrorBoundary>
      <DownloadContext.Provider value={DownloadContextValue}>
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
              <Tabs.Screen name="SeriesDetail" options={{ href: null }} />
              <Tabs.Screen name="EpisodeList" options={{ href: null }} />
              <Tabs.Screen name="MovieDetail" options={{ href: null }} />
            </Tabs>
            {/* Persistent MiniPlayer, visible on all screens */}
            <MiniPlayer />
          </View>
        </MiniPlayerProvider>
      </DownloadContext.Provider>
    </ErrorBoundary>
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
