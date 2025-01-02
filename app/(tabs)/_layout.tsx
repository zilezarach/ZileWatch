import { Tabs } from "expo-router";
import { MaterialIcons, FontAwesome5 } from "@expo/vector-icons";
import React, { createContext, useContext, useState } from "react";

//Type definations
type DownloadContextType = {
  activeDownloads: number;
  setActiveDownloads: React.Dispatch<React.SetStateAction<number>>;
  completeDownloads: string[];
  setCompleteDownloads: React.Dispatch<React.SetStateAction<string[]>>;
};
//create download const
const DownloadContext = createContext<DownloadContextType>({
  activeDownloads: 0,
  setActiveDownloads: () => {},
  completeDownloads: [],
  setCompleteDownloads: () => {},
});

export default function Layout() {
  const [activeDownloads, setActiveDownloads] = useState(0);
  const [completeDownloads, setCompleteDownloads] = useState<string[]>([]);

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
            tabBarBadge: activeDownloads > 0 ? activeDownloads : undefined,
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
