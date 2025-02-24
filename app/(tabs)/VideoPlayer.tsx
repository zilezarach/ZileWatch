import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  Dimensions,
  TouchableOpacity,
  Alert,
  Platform,
  Modal
} from "react-native";
import Video, { VideoRef } from "react-native-video";
import axios from "axios";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { RootStackParamList } from "@/types/navigation";
import Constants from "expo-constants";
import * as ScreenOrientation from "expo-screen-orientation";
import { Ionicons } from "@expo/vector-icons";
import { useMiniPlayer } from "../../context/MiniPlayerContext";

const { width } = Dimensions.get("window");

const VideoPlayer = () => {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isLandscape, setLandscape] = useState<boolean>(false);
  const [downloadModalVisable, setDownloadModalVisable] = useState(false);
  const route = useRoute<RouteProp<RootStackParamList, "VideoPlayer">>();
  const videoRef = useRef<VideoRef>(null);
  const [isPaused, setPaused] = useState(false);
  const navigation = useNavigation();
  const DOWNLOADER_API = Constants.expoConfig?.extra?.API_Backend;
  const videoUrl = route.params.videoUrl.trim();

  const { miniPlayer, setMiniPlayer } = useMiniPlayer();
  //fetch stream url
  useEffect(() => {
    const fetchStreamUrl = async () => {
      try {
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

  //handle Screen Rotation

  useEffect(() => {
    const updateOrientation = async () => {
      const orientation = await ScreenOrientation.getOrientationAsync();
      if (
        orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
        orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
      ) {
        setLandscape(true);
      } else {
        setLandscape(false);
      }
    };

    updateOrientation();

    const subscription = ScreenOrientation.addOrientationChangeListener(evt => {
      const orientation = evt.orientationInfo.orientation;
      if (
        orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
        orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
      ) {
        setLandscape(true);
        // For iOS, use native fullscreen
        if (Platform.OS === "ios" && videoRef.current?.presentFullscreenPlayer) {
          videoRef.current.presentFullscreenPlayer();
        }
      } else if (
        orientation === ScreenOrientation.Orientation.PORTRAIT_UP ||
        orientation === ScreenOrientation.Orientation.PORTRAIT_DOWN
      ) {
        setLandscape(false);
        if (Platform.OS === "ios" && videoRef.current?.dismissFullscreenPlayer) {
          videoRef.current.dismissFullscreenPlayer();
        }
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

  const togglePlaypause = () => {
    setPaused(prev => !prev);
  };

  const returnToFullScreen = () => {
    if (videoRef.current?.presentFullscreenPlayer) {
      videoRef.current.presentFullscreenPlayer();
    }
  };

  const openModal = () => {
    setDownloadModalVisable(true);
  };

  const toggleMiniPlayer = () => {
    // When toggled, update the global mini player state.
    if (!miniPlayer.visible) {
      setMiniPlayer({
        visible: true,
        videoUrl: streamUrl || null,
        title: "Now Playing" // You might replace this with a proper title.
      });
    } else {
      setMiniPlayer({ ...miniPlayer, visible: false });
    }
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
  const videoStyle = Platform.OS === "android" && isLandscape ? [styles.video, styles.fullscreenVid] : styles.video;

  return (
    <View style={styles.container}>
      {/* Header with controls */}
      <View style={styles.header}>
        <TouchableOpacity onPress={toggleMiniPlayer} style={styles.headerButton}>
          <Ionicons name="contract" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={togglePlaypause} style={styles.headerButton}>
          <Ionicons name={isPaused ? "play" : "pause"} size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={returnToFullScreen} style={styles.headerButton}>
          <Ionicons name="expand" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <Video
        source={{ uri: streamUrl }}
        style={videoStyle}
        controls
        resizeMode="contain"
        paused={false}
        ref={videoRef}
        onLoad={() => setLoading(false)}
      />

      {/*Download Modal*/}
      <Modal
        visible={downloadModalVisable}
        animationType="slide"
        transparent
        onRequestClose={() => setDownloadModalVisable(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Formats</Text>
            <TouchableOpacity onPress={() => setDownloadModalVisable(false)}>
              <Ionicons name="videocam" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDownloadModalVisable(false)}>
              <Ionicons name="musical-note" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDownloadModalVisable(false)}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  video: {
    width: "100%",
    height: (width * 9) / 16,
    backgroundColor: "#000"
  },
  modalTitle: {
    fontWeight: "bold",
    fontSize: 10,
    color: "#7d0b02",
    marginBottom: 15
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.8)",
    padding: 20
  },
  modalContent: {
    backgroundColor: "#1E1E1E",
    borderRadius: 10,
    padding: 20,
    alignItems: "center"
  },
  optionModal: {
    backgroundColor: "#7d0b02",
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginVertical: 5,
    width: "100%",
    alignItems: "center"
  },
  fullscreenVid: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: Dimensions.get("window").width,
    height: Dimensions.get("window").height
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000"
  },
  loaderText: { color: "#FFF", marginTop: 10 },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000"
  },
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
  headerButton: { padding: 10 }
});

export default VideoPlayer;
