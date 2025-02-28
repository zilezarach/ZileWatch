import React, { useEffect, useRef, useState } from "react";
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  Dimensions,
} from "react-native";
import Video, { VideoRef } from "react-native-video";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { RootStackParamList } from "@/types/navigation";
import Constants from "expo-constants";
import * as ScreenOrientation from "expo-screen-orientation";
import { Ionicons } from "@expo/vector-icons";
import { useMiniPlayer } from "../../context/MiniPlayerContext";
import axios from "axios";

const { width, height } = Dimensions.get("window");

const StreamVideo = () => {
  const route = useRoute<RouteProp<RootStackParamList, "Stream">>();
  // Expect route params: magnetLink and videoTitle
  const { magnetLink, videoTitle } = route.params;
  const navigation = useNavigation();
  const videoRef = useRef<VideoRef>(null);
  const DOWNLOADER_API = Constants.expoConfig?.extra?.API_Backend;

  // Add quality state; default to "hd"
  const [quality, setQuality] = useState<"hd" | "sd">("hd");
  const [streamUrl, setStreamUrl] = useState<string>("");
  const [isLoading, setLoading] = useState<boolean>(true);
  const [isPlaying, setPlaying] = useState<boolean>(true);
  const [isLandscape, setIsLandscape] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { miniPlayer, setMiniPlayer } = useMiniPlayer();

  // Build the streaming URL including the quality parameter
  const fetchStream = async () => {
    try {
      setLoading(true);
      // Here, we assume your backend stream endpoint accepts a "quality" query param.
      // For "hd" we use a merged bestvideo+bestaudio; for "sd" we use a lower quality.
      const encodedMagnet = encodeURIComponent(magnetLink);
      const url = `${DOWNLOADER_API}/stream-torrents?magnet=${encodedMagnet}&quality=${quality}`;
      const response = await axios.get(url);
      if (response.data && response.data.streamUrl) {
        setStreamUrl(response.data.streamUrl);
        setError(null);
      } else {
        throw new Error("Streaming URL not available");
      }
    } catch (err: any) {
      console.error("Streaming error:", err);
      setError(err.message || "Streaming error");
      Alert.alert("Error", err.message || "Unable to stream video.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!magnetLink || magnetLink.trim() === "") {
      Alert.alert("Error", "Invalid video reference.");
      navigation.goBack();
    } else {
      fetchStream();
    }
  }, [magnetLink, quality]);

  // Orientation handling for fullscreen on iOS and adaptive layout on Android
  useEffect(() => {
    const checkOrientation = async () => {
      const current = await ScreenOrientation.getOrientationAsync();
      setIsLandscape(
        current === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
          current === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
      );
    };

    checkOrientation();

    const subscription = ScreenOrientation.addOrientationChangeListener(
      (evt) => {
        const orientation = evt.orientationInfo.orientation;
        if (
          orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
          orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
        ) {
          setIsLandscape(true);
          if (
            Platform.OS === "ios" &&
            videoRef.current?.presentFullscreenPlayer
          ) {
            videoRef.current.presentFullscreenPlayer();
          }
        } else if (
          orientation === ScreenOrientation.Orientation.PORTRAIT_UP ||
          orientation === ScreenOrientation.Orientation.PORTRAIT_DOWN
        ) {
          setIsLandscape(false);
          if (
            Platform.OS === "ios" &&
            videoRef.current?.dismissFullscreenPlayer
          ) {
            videoRef.current.dismissFullscreenPlayer();
          }
        }
      }
    );

    return () => {
      ScreenOrientation.removeOrientationChangeListener(subscription);
    };
  }, []);

  // Buffering indicator callback
  const handleBuffer = ({ isBuffering }: { isBuffering: boolean }) => {
    setIsBuffering(isBuffering);
  };

  const handleClose = () => {
    setPlaying(false);
    navigation.goBack();
  };

  const toggleMiniPlayer = () => {
    if (!miniPlayer.visible) {
      setMiniPlayer({ visible: true, videoUrl: streamUrl, title: videoTitle });
    } else {
      setMiniPlayer({ ...miniPlayer, visible: false });
    }
  };

  // Placeholder for download logic – implement as needed
  const handleDownload = () => {
    Alert.alert("Download", "Download functionality to be implemented.");
  };

  const toggleQuality = (selected: "hd" | "sd") => {
    if (quality !== selected) {
      setQuality(selected);
    }
  };

  const videoStyle =
    Platform.OS === "android" && isLandscape
      ? [styles.video, styles.fullscreenVideo]
      : styles.video;

  return (
    <View style={styles.container}>
      {/* Quality Selection Controls */}
      <View style={styles.qualityControls}>
        <TouchableOpacity
          onPress={() => toggleQuality("hd")}
          style={[
            styles.qualityButton,
            quality === "hd" && styles.activeQuality,
          ]}
        >
          <Text style={styles.qualityButtonText}>HD</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => toggleQuality("sd")}
          style={[
            styles.qualityButton,
            quality === "sd" && styles.activeQuality,
          ]}
        >
          <Text style={styles.qualityButtonText}>SD</Text>
        </TouchableOpacity>
      </View>

      {/* Buffering Indicator */}
      {isBuffering && (
        <View style={styles.bufferContainer}>
          <ActivityIndicator size="large" color="#7d0b02" />
          <Text style={styles.bufferText}>Buffering...</Text>
        </View>
      )}

      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#7d0b02" />
          <Text style={styles.loaderText}>Loading Video...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <Video
          source={{ uri: streamUrl }}
          style={videoStyle}
          controls
          resizeMode="contain"
          paused={!isPlaying}
          ref={videoRef}
          onError={(err) => {
            console.error("Streaming Error", err);
            Alert.alert("Error", "Unable to stream video.");
          }}
          onBuffer={handleBuffer}
        />
      )}

      {/* Header Controls */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={toggleMiniPlayer}
          style={styles.headerButton}
        >
          <Ionicons
            name={miniPlayer.visible ? "expand" : "contract"}
            size={24}
            color="#fff"
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDownload} style={styles.headerButton}>
          <Ionicons name="download" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* MiniPlayer Overlay (if visible) */}
      {miniPlayer.visible && (
        <View style={styles.miniPlayerOverlay}>
          <TouchableOpacity
            onPress={toggleMiniPlayer}
            style={styles.headerButton}
          >
            <Ionicons name="expand" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  video: { width: "100%", height: 300, backgroundColor: "#000" },
  fullscreenVideo: {
    position: "absolute",
    top: 0,
    left: 0,
    width: Dimensions.get("window").width,
    height: Dimensions.get("window").height,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  loaderText: { color: "#fff", marginTop: 10 },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  errorText: { color: "red", fontSize: 16 },
  header: {
    position: "absolute",
    top: 20,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    zIndex: 3,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingVertical: 5,
  },
  headerButton: { padding: 10 },
  qualityControls: {
    flexDirection: "row",
    justifyContent: "center",
    marginVertical: 10,
  },
  qualityButton: {
    backgroundColor: "#444",
    paddingHorizontal: 15,
    paddingVertical: 8,
    marginHorizontal: 5,
    borderRadius: 5,
  },
  activeQuality: {
    backgroundColor: "#7d0b02",
  },
  qualityButtonText: { color: "#fff", fontSize: 16 },
  bufferContainer: {
    position: "absolute",
    top: "45%",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 4,
  },
  bufferText: { color: "#7d0b02", marginTop: 5 },
  miniPlayerOverlay: {
    position: "absolute",
    bottom: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-around",
    width: 160,
    zIndex: 4,
  },
});

export default StreamVideo;
