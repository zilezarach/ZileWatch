import React from "react";

import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Home from "./Home";
import VideoPlayer from "./VideoPlayer";
import VideoList from "@/components/videoList";

const Stack = createNativeStackNavigator();

const AppNavigator = () => {
  return (
    <>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={Home} />
        <Stack.Screen name="VideoPlayer" component={VideoPlayer} />
        <Stack.Screen name="VideoList" component={VideoList} />
      </Stack.Navigator>
    </>
  );
};

export default AppNavigator;
