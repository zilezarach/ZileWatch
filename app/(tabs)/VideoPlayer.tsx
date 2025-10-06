import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  StatusBar,
  BackHandler,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { ResizeMode, Video } from "expo-av";
import * as ScreenOrientation from "expo-screen-orientation";

export default function VideoPlayer() {
  const navigation = useNavigation();
  const route = useRoute();
  const { videoUrl, title } = route.params as {
    videoUrl: string;
    title?: string;
  };

  const videoRef = useRef<Video>(null);
  const [loading, setLoading] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      gestureEnabled: false,
      headerShown: false,
    });
  }, [navigation]);

  // Handle Android hardware back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        handleGoBack();
        return true;
      },
    );

    return () => backHandler.remove();
  }, []);

  // Listen to orientation changes
  useEffect(() => {
    const subscription = ScreenOrientation.addOrientationChangeListener(
      ({ orientationInfo }) => {
        setIsLandscape(
          orientationInfo.orientation ===
            ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
            orientationInfo.orientation ===
              ScreenOrientation.Orientation.LANDSCAPE_RIGHT,
        );
      },
    );

    return () => {
      ScreenOrientation.removeOrientationChangeListener(subscription);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupVideo();
    };
  }, []);

  const cleanupVideo = async () => {
    try {
      if (videoRef.current) {
        await videoRef.current.stopAsync();
        await videoRef.current.unloadAsync();
      }
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT,
      );
      StatusBar.setHidden(false, "fade");
    } catch (error) {
      console.error("Cleanup error:", error);
    }
  };

  const handleGoBack = async () => {
    const status = await videoRef.current?.getStatusAsync();

    // Check if video is loaded and playing
    if (status && status.isLoaded && status.isPlaying) {
      Alert.alert("Exit Video?", "Are you sure you want to stop playing?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Exit",
          onPress: async () => {
            await cleanupVideo();
            navigation.goBack();
          },
        },
      ]);
    } else {
      await cleanupVideo();
      navigation.goBack();
    }
  };

  return (
    <View style={styles.container}>
      {loading && (
        <ActivityIndicator size="large" color="#fff" style={styles.loading} />
      )}

      <Video
        ref={videoRef}
        source={{ uri: videoUrl }}
        style={isLandscape ? styles.videoLandscape : styles.videoPortrait}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay={false}
        onLoadStart={() => setLoading(true)}
        onReadyForDisplay={() => {
          setLoading(false);
          videoRef.current?.playAsync();
        }}
        onError={(err) => {
          console.error("Video error:", err);
          Alert.alert("Error", "Failed to load video stream.");
          setLoading(false);
        }}
      />

      {/* Back button only in portrait */}
      {!isLandscape && (
        <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "black",
    justifyContent: "center",
    alignItems: "center",
  },
  videoPortrait: {
    width: "100%",
    height: 250,
    backgroundColor: "black",
  },
  videoLandscape: {
    width: "100%",
    height: "100%",
    backgroundColor: "black",
  },
  loading: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginLeft: -20,
    marginTop: -20,
  },
  backButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 20,
    left: 20,
    padding: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 5,
  },
  backText: {
    color: "#fff",
    fontSize: 16,
  },
});
