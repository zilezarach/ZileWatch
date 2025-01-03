import { Tabs } from "expo-router";
import { MaterialIcons, FontAwesome5 } from "@expo/vector-icons";
import React, { createContext, useContext, useState } from "react";

// Create Download Context with Proper Default Values
const DownloadContext = createContext<DownloadContextType>({
  activeDownloads: {},
  setActiveDownloads: () => {
    // Default no-op function
    console.warn("setActiveDownloads is not initialized!");
  },
  completeDownloads: [],
  setCompleteDownloads: () => {
    // Default no-op function
    console.warn("setCompleteDownloads is not initialized!");
  },
});

//type definations
type ActiveDownload = {
  title: string;
  progress: number; // Progress in percentage
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
      </Tabs>
    </DownloadContext.Provider>
  );
}

export { DownloadContext };
