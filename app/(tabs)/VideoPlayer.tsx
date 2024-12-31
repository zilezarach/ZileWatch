import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  Dimensions,
} from "react-native";
import Video, { VideoRef } from "react-native-video";
import axios from "axios";
import { useRoute, RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "@/types/navigation";

const { width } = Dimensions.get("window");

const VideoPlayer = () => {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const route = useRoute<RouteProp<RootStackParamList, "VideoPlayer">>();
  const videoRef = useRef<VideoRef>(null);
  const videoUrl = route.params.videoUrl;

  let videoId = null;
  if (videoUrl.includes("v=")) {
    videoId = videoUrl.split("v=")[1]?.split("&")[0];
  } else if (videoUrl.includes("youtu.be")) {
    videoId = videoUrl.split("youtu.be/")[1]?.split("?")[0];
  }
  useEffect(() => {
    const fetchStreamUrl = async () => {
      try {
        const response = await axios.get(
          "http://192.168.100.32:5000/streamvideos",
          {
            params: { url: videoId },
          },
        );
        setStreamUrl(response.data.streamUrl);
      } catch (err) {
        setError("Error fetching stream URL");
      } finally {
        setLoading(false);
      }
    };

    fetchStreamUrl();
  }, [videoId]);

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#7d0b02" />
        <Text style={styles.loaderText}>Loading Video...</Text>
      </View>
    );
  }

  if (error || !streamUrl) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error || "Failed to load video"}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Video
        source={{ uri: streamUrl }} // Direct video stream URL
        style={styles.video}
        controls={true}
        ref={videoRef}
        resizeMode="contain"
        paused={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
  },
  video: {
    width: "100%",
    height: (width * 9) / 16, // 16:9 Aspect Ratio
    backgroundColor: "#000",
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  loaderText: {
    color: "#FFF",
    marginTop: 10,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  errorText: {
    color: "red",
    fontSize: 16,
    fontWeight: "bold",
  },
});

export default VideoPlayer;
