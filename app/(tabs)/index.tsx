import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Image, View, StyleSheet, Platform, StatusBar } from "react-native";
import Home from "./Home";
import VideoPlayer from "./VideoPlayer";
import Movies from "./Movies";
import StreamVideo from "./Stream";
import SeriesDetail from "./SeriesDetail";
import EpisodeListScreen from "./EpisodeList";
import MovieDetail from "./MovieDetail";
import { RootStackParamList } from "@/types/navigation";
import UpdateManager from "@/components/updateChecker";

// Enhanced header component with better styling
const HeaderLogo = ({
  source,
  width,
  height,
}: {
  source: any;
  width: number;
  height: number;
}) => (
  <View style={styles.headerContainer}>
    <View style={styles.logoWrapper}>
      <Image
        source={source}
        style={[{ width, height }, styles.logoImage]}
        resizeMode="contain"
      />
    </View>
  </View>
);

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavigator = () => {
  return (
    <>
      {/* Status bar configuration */}
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#fff"
        translucent={false}
      />

      <UpdateManager />

      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: "#fff",
          },
          headerTintColor: "#000",
          headerTitleStyle: {
            fontWeight: "600",
            fontSize: 18,
          },
          // Smooth animations
          animation: "slide_from_right",
          animationDuration: 250,
          headerBackVisible: false,
          headerBackButtonMenuEnabled: false,
        }}
      >
        <Stack.Screen
          name="Home"
          component={Home}
          options={{
            headerTitle: () => (
              <HeaderLogo
                source={require("../../assets/images/HomeLogo.png")}
                width={100}
                height={50}
              />
            ),
            headerShadowVisible: true,
          }}
        />

        <Stack.Screen
          name="VideoPlayer"
          component={VideoPlayer}
          options={{
            headerTitle: () => (
              <HeaderLogo
                source={require("../../assets/images/Original.png")}
                width={92}
                height={50}
              />
            ),
            presentation: "fullScreenModal",
            headerStyle: { backgroundColor: "#fff" },
            headerShadowVisible: false,
            gestureEnabled: true,
            gestureDirection: "vertical",
          }}
        />

        <Stack.Screen
          name="Stream"
          component={StreamVideo}
          options={{
            headerTitle: "Stream Video",
            presentation: "fullScreenModal",
            headerStyle: { backgroundColor: "#fff" },
            headerShadowVisible: false,
            gestureEnabled: true,
            gestureDirection: "vertical",
          }}
        />

        <Stack.Screen
          name="Movies"
          component={Movies}
          options={{
            headerTitle: "Movies",
            headerLargeTitle: Platform.OS === "ios",
            headerStyle: { backgroundColor: "#fff" },
            headerBackground: () => <View style={styles.shadowMedium} />,
          }}
        />

        <Stack.Screen
          name="SeriesDetail"
          component={SeriesDetail}
          options={{
            headerTitle: "Series Details",
            headerStyle: { backgroundColor: "#fff" },
            headerBackground: () => <View style={styles.shadowStrong} />,
          }}
        />

        <Stack.Screen
          name="EpisodeList"
          component={EpisodeListScreen}
          options={{
            headerTitle: "Episodes",
            headerStyle: { backgroundColor: "#fff" },
            headerBackground: () => <View style={styles.shadowMedium} />,
          }}
        />

        <Stack.Screen
          name="MovieDetail"
          component={MovieDetail}
          options={{
            headerTitle: "Movie Details",
            headerStyle: { backgroundColor: "#fff" },
            headerBackground: () => <View style={styles.shadowStrong} />,
          }}
        />
      </Stack.Navigator>
    </>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    flex: 1,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  logoWrapper: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 4,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  logoImage: {
    tintColor: undefined,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  // Reusable shadows for header backgrounds
  shadowMedium: {
    flex: 1,
    backgroundColor: "#fff",
    ...Platform.select({
      android: { elevation: 4 },
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
      },
    }),
  },
  shadowStrong: {
    flex: 1,
    backgroundColor: "#fff",
    ...Platform.select({
      android: { elevation: 6 },
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
      },
    }),
  },
});

export default AppNavigator;
