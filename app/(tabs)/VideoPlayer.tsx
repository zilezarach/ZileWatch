import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, ActivityIndicator, Text, Dimensions, TouchableOpacity, Alert, Share } from "react-native";
import Video, { VideoRef } from "react-native-video";
import Slider from "@react-native-community/slider";
import axios from "axios";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { RootStackParamList } from "@/types/navigation";
import Constants from "expo-constants";
import * as ScreenOrientation from "expo-screen-orientation";
import { Ionicons } from "@expo/vector-icons";

const { width } = Dimensions.get("window");

const VideoPlayer = () => {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isMiniPlayer, setMiniPlayer] = useState(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);

  const route = useRoute<RouteProp<RootStackParamList, "VideoPlayer">>();
  const navigation = useNavigation();
  // Assume full URL is provided; if not, you could use a helper to reconstruct.
  const videoUrl = route.params.videoUrl.trim();
  const DOWNLOADER_API = Constants.expoConfig?.extra?.API_Backend;
  const videoRef = useRef<VideoRef>(null);

  useEffect(() => {
    const fetchStreamUrl = async () => {
      try {
        // Passing the full URL directly; adjust if you need to reconstruct.
        const response = await axios.get(`${DOWNLOADER_API}/stream-videos`, {
          params: { url: videoUrl }
        });
        setStreamUrl(response.data.streamUrl);
      } catch (err) {
        setError("Error fetching stream URL");
      } finally {
        setLoading(false);
      }
    };

    fetchStreamUrl();
  }, [videoUrl, DOWNLOADER_API]);

  // Orientation listener for auto-fullscreen.
  useEffect(() => {
    const subscription = ScreenOrientation.addOrientationChangeListener(evt => {
      const orientation = evt.orientationInfo.orientation;
      if (
        orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
        orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
      ) {
        videoRef.current?.presentFullscreenPlayer();
      } else if (
        orientation === ScreenOrientation.Orientation.PORTRAIT_UP ||
        orientation === ScreenOrientation.Orientation.PORTRAIT_DOWN
      ) {
        videoRef.current?.dismissFullscreenPlayer();
      }
    });
    return () => {
      ScreenOrientation.removeOrientationChangeListener(subscription);
    };
  }, []);

  const handleClose = () => {
    videoRef.current?.dismissFullscreenPlayer();
    navigation.goBack();
  };

  const toggleMiniPlayer = () => {
    setMiniPlayer(prev => !prev);
  };

  const toggleMute = () => {
    setIsMuted(prev => !prev);
  };

  const cyclePlaybackRate = () => {
    // Cycle through 1, 1.5, and 2.
    setPlaybackRate(prev => (prev === 1 ? 1.5 : prev === 1.5 ? 2 : 1));
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out this video: ${videoUrl}`
      });
    } catch (error) {
      Alert.alert("Error", "Unable to share the video.");
    }
  };

  const onProgress = (data: { currentTime: number }) => {
    setCurrentTime(data.currentTime);
  };

  const onLoad = (data: { duration: number }) => {
    setDuration(data.duration);
  };

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
      {/* Overlay Header Controls */}
      <View style={styles.header}>
        <TouchableOpacity onPress={toggleMiniPlayer} style={styles.headerButton}>
          <Ionicons name={isMiniPlayer ? "expand" : "contract"} size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleMute} style={styles.headerButton}>
          <Ionicons name={isMuted ? "volume-mute" : "volume-high"} size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={cyclePlaybackRate} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>{playbackRate}x</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleShare} style={styles.headerButton}>
          <Ionicons name="share-social" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Video Component */}
      <Video
        source={{ uri: streamUrl }}
        style={isMiniPlayer ? styles.miniplayerVideo : styles.video}
        controls
        resizeMode="contain"
        paused={false}
        muted={isMuted}
        rate={playbackRate}
        ref={videoRef}
        onLoad={onLoad}
        onProgress={onProgress}
        onError={error => {
          console.error("Video Player Error", error);
          setError("Error playing video");
        }}
      />

      {/* Playback Progress Slider */}
      {!isMiniPlayer && (
        <View style={styles.progressContainer}>
          <Text style={styles.progressTime}>{formatTime(currentTime)}</Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={duration}
            value={currentTime}
            minimumTrackTintColor="#7d0b02"
            maximumTrackTintColor="#FFF"
            thumbTintColor="#7d0b02"
            onValueChange={value => {
              // Seek video when user slides
              videoRef.current?.seek(value);
              setCurrentTime(value);
            }}
          />
          <Text style={styles.progressTime}>{formatTime(duration)}</Text>
        </View>
      )}

      {/* Optionally, in miniplayer mode, you can display a smaller set of controls */}
      {isMiniPlayer && (
        <View style={styles.miniplayerOverlay}>
          <TouchableOpacity onPress={toggleMiniPlayer} style={styles.headerButton}>
            <Ionicons name="expand" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

// Helper to format seconds to mm:ss
const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  video: {
    width: "100%",
    height: (width * 9) / 16,
    backgroundColor: "#000"
  },
  miniplayerVideo: {
    position: "absolute",
    bottom: 20,
    right: 20,
    width: 160,
    height: 90,
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: "#7d0b02",
    zIndex: 2
  },
  loaderContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#000" },
  loaderText: { color: "#FFF", marginTop: 10 },
  errorContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#000" },
  errorText: { color: "red", fontSize: 16, fontWeight: "bold" },
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
    paddingVertical: 5
  },
  headerButton: { padding: 10 },
  headerButtonText: { color: "#fff", fontSize: 14 },
  progressContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(0,0,0,0.7)"
  },
  slider: { flex: 1, marginHorizontal: 10 },
  progressTime: { color: "#FFF", fontSize: 12 },
  miniplayerOverlay: {
    position: "absolute",
    bottom: 20,
    right: 20,
    flexDirection: "row",
    zIndex: 4
  }
});

export default VideoPlayer;
