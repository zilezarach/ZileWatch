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
import * as FileSystem from "expo-file-system";

const { width, height } = Dimensions.get("window");
const DOWNLOADER_API =
  Constants.expoConfig?.extra?.API_Backend || "http://your-backend-url:3000";

type StreamRouteProp = RouteProp<RootStackParamList, "Stream">;

const StreamVideo = () => {
  const route = useRoute<StreamRouteProp>();
  const { magnetLink, videoTitle } = route.params;
  const navigation = useNavigation();
  const videoRef = useRef<VideoRef>(null);

  const [quality, setQuality] = useState<"hd" | "sd">("hd");
  const [streamUrl, setStreamUrl] = useState<string>("");
  const [isLoading, setLoading] = useState<boolean>(true);
  const [isPlaying, setPlaying] = useState<boolean>(true);
  const [isLandscape, setIsLandscape] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [infoHash, setInfoHash] = useState<string | null>(null);
  const { miniPlayer, setMiniPlayer } = useMiniPlayer();

  const setupStream = async () => {
    try {
      setLoading(true);
      const encodedMagnet = encodeURIComponent(magnetLink);

      // Get file list first
      const filesRes = await axios.get(`${DOWNLOADER_API}/torrent/files`, {
        params: { magnet: magnetLink },
      });

      if (!filesRes.data.files?.length) {
        throw new Error("No playable files found");
      }

      // Auto-select best quality
      const bestFile = filesRes.data.files.reduce((prev, current) =>
        current.size > prev.size ? current : prev
      );

      setStreamUrl(
        `${DOWNLOADER_API}/stream-torrents?` +
          `magnet=${encodedMagnet}&fileIndex=${bestFile.index}`
      );

      setInfoHash(filesRes.data.infoHash);
      setError(null);
    } catch (error) {
      console.error("Stream setup failed:", error);
      setError("Setup Failed Try Later");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!magnetLink || magnetLink.trim() === "") {
      Alert.alert("Error", "Invalid video reference.");
      navigation.goBack();
    } else {
      setupStream();
    }
  }, [magnetLink, quality]);

  // Progress tracking
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (infoHash) {
      interval = setInterval(async () => {
        try {
          const response = await axios.get(
            `${DOWNLOADER_API}/torrent/progress`,
            {
              params: { infoHash },
            }
          );
          setProgress(response.data.progress * 100);
        } catch (err) {
          console.error("Progress fetch error:", err);
        }
      }, 5000); // Poll every 5 seconds
    }
    return () => clearInterval(interval);
  }, [infoHash]);

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
        setIsLandscape(
          orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
            orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
        );
        if (Platform.OS === "ios" && videoRef.current) {
          if (
            orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
            orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
          ) {
            videoRef.current.presentFullscreenPlayer();
          } else {
            videoRef.current.dismissFullscreenPlayer();
          }
        }
      }
    );

    return () =>
      ScreenOrientation.removeOrientationChangeListener(subscription);
  }, []);

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

  const handleDownload = async () => {
    try {
      setLoading(true);
      const downloadUrl = `${DOWNLOADER_API}/api/download-torrents?magnet=${encodeURIComponent(
        magnetLink
      )}`;
      const fileUri = `${FileSystem.documentDirectory}${videoTitle}.mp4`;
      await FileSystem.downloadAsync(downloadUrl, fileUri);
      Alert.alert("Download Complete", `Saved to ${fileUri}`);
    } catch (error) {
      console.error("Download error:", error);
      Alert.alert("Error", "Failed to download video.");
    } finally {
      setLoading(false);
    }
  };

  const toggleQuality = (selected: "hd" | "sd") => {
    if (quality !== selected) {
      setQuality(selected);
      setupStream();
    }
  };

  const videoStyle =
    Platform.OS === "android" && isLandscape
      ? [styles.video, styles.fullscreenVideo]
      : styles.video;

  return (
    <View style={styles.container}>
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

      {isBuffering && (
        <View style={styles.bufferContainer}>
          <ActivityIndicator size="large" color="#7d0b02" />
          <Text style={styles.bufferText}>
            Buffering... ({progress.toFixed(1)}% downloaded)
          </Text>
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
          <TouchableOpacity onPress={setupStream} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Video
          source={{
            uri: streamUrl,
            headers: {
              "Cache-Control": "max-age=6048000",
              "Accept-Encoding": "identity",
            },
          }}
          style={videoStyle}
          controls
          resizeMode="contain"
          paused={!isPlaying}
          ref={videoRef}
          onError={(err) => {
            console.error("Video playback error:", err);
            setError("Failed to play video.");
            Alert.alert("Playback Error", "Unable to play the video.");
          }}
          onBuffer={handleBuffer}
          onLoad={() => setLoading(false)}
          bufferConfig={{
            minBufferMs: 15000,
            maxBufferMs: 50000,
            bufferForPlaybackMs: 5000,
            bufferForPlaybackAfterRebufferMs: 10000,
          }}
        />
      )}

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
  errorText: { color: "red", fontSize: 16, marginBottom: 20 },
  retryButton: { backgroundColor: "#7d0b02", padding: 10, borderRadius: 5 },
  retryButtonText: { color: "#fff", fontSize: 16 },
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
  activeQuality: { backgroundColor: "#7d0b02" },
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
