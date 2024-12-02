import React from "react";

import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Home from "./Home";
import VideoPlayer from "./VideoPlayer";
import { Image, View, StyleSheet } from "react-native";
import VideoList from "@/components/videoList";

const Stack = createNativeStackNavigator();

const AppNavigator = () => {
  return (
    <>
      <Stack.Navigator>
        <Stack.Screen
          name="Home"
          component={Home}
          options={{
            headerTitle: () => (
              <View style={styles.headerContainer}>
                <Image source={require("../../assets/images/HomeLogo.png")} style={{ width: 100, height: 50 }} />
              </View>
            )
          }}
        />
        <Stack.Screen
          name="VideoPlayer"
          component={VideoPlayer}
          options={{
            headerTitle: () => (
              <View style={styles.headerContainer}>
                <Image source={require("../../assets/images/Original.png")} style={{ width: 92, height: 50 }} />
              </View>
            )
          }}
        />
        <Stack.Screen name="VideoList" component={VideoList} />
      </Stack.Navigator>
    </>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    flex: 1,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center"
  }
});

export default AppNavigator;
