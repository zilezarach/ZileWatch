import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Home from "./Home";
import VideoPlayer from "./VideoPlayer";
import { Image, View, StyleSheet } from "react-native";
import VideoList from "@/components/videoList";
import Movies from "./Movies";
import StreamVideo from "./Stream";
import SeriesDet from "./SeriesDet";
import EpisodeListScreen from "./EpisodeList";
import { RootStackParamList } from "@/types/navigation";

// Define a reusable header component for consistency
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
    <Image source={source} style={{ width, height }} resizeMode="contain" />
  </View>
);

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        // Customize header styles for a clean look
        headerStyle: {
          backgroundColor: "#fff",
        },
        headerTintColor: "#000",
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
        }}
      />
      <Stack.Screen name="Stream" component={StreamVideo} />
      <Stack.Screen name="Movies" component={Movies} />
      <Stack.Screen name="SeriesDetail" component={SeriesDet} />
      <Stack.Screen name="EpisodeList" component={EpisodeListScreen} />
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    flex: 1,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
});

export default AppNavigator;
