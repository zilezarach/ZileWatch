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
import { useSafeArea } from "react-native-safe-area-context";

const { width, height } = Dimensions.get("window");
const DOWNLOADER_API = Constants.expoConfig?.extra?.API_Backend;

type StreamRouteProp = RouteProp<RootStackParamList, "Stream">;

const StreamVideo = () => {
  const route = useRoute<StreamRouteProp>();
  const {
    mediaType = "movie",
    id,
    sourceId,
    videoTitle,
    season = 0,
    episode = 0,
  } = route.params;
  const navigation = useNavigation();
  const videoRef = useRef<VideoRef>(null);

  const [quality, setQuality] = useState<"hd" | "sd">("hd");
  const [streamUrl, setStreamUrl] = useState<string>("");
  const [sourceName, setSourceName] = useState<string>("");
  const [isLoading, setLoading] = useState<boolean>(true);
  const [isPlaying, setPlaying] = useState<boolean>(true);
  const [isLandscape, setIsLandscape] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [infoHash, setInfoHash] = useState<string | null>(null);
  const { miniPlayer, setMiniPlayer } = useMiniPlayer();
  const [debugInfo, setDebugInfo] = useState<string>("");
  const [streamType, setStreamType] = useState<string | null>(null);
  // Setup Stream
  const setupStream = async () => {
    try {
      setLoading(true);
      setError(null);
      // Comprehensive logging
      console.log("Stream setup params:", {
        mediaType,
        id,
        sourceId,
        season,
        episode,
        quality,
      });

      // Prepare request parameters with robust type handling
      const params: any = {
        mediaType: mediaType || "movie",
        id,
        sourceId,
        quality,
        ...(mediaType === "show" && {
          season: season || 0,
          episode: episode || 0,
        }),
      };
      console.log("Requesting stream with params:", params);
      // Request stream URL from backend
      const response = await axios.get(`${DOWNLOADER_API}/stream`, {
        params,
        timeout: 10000,
      });

      console.log("Stream response:", response.data);

      if (response.data && response.data.streamUrl) {
        const streamUrl = response.data.streamUrl;
        const headers = response.data.headers || {};
        //valid stream url
        if (!streamUrl.startsWith("http")) {
          throw new Error("Invalid Stream Url");
        }
        setStreamUrl(response.data.streamUrl);
        setSourceName(response.data.source || "Unknown Source");
        setStreamType(response.data.streamType || null);
        setHeaders(response.data.headers || {});
        setError(null);
        setDebugInfo(`Stream URL: ${streamUrl.substring(0, 50)}...`);
      } else {
        throw new Error("No stream URL returned from API");
      }
    } catch (err: any) {
      console.error("Stream setup failed:", err);
      let errorMessage = "";

      if (err.response) {
        // Server responded with an error
        errorMessage = `Server error: ${err.response.status} - ${JSON.stringify(
          err.response.data
        )}`;
      } else if (err.request) {
        // No response received from server
        errorMessage = "No response from server. Check network connection.";
      } else {
        // Error setting up request
        errorMessage = err.message || "Failed to set up stream request";
      }

      console.log(errorMessage);
      setDebugInfo(debugInfo + "\nError: " + errorMessage);
      setError(errorMessage);
      Alert.alert("Error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id) {
      Alert.alert("Error", "Invalid media reference.");
      navigation.goBack();
    } else {
      setupStream();
    }

    // Clear listeners when component unmounts
    return () => {
      // Any cleanup code
    };
  }, [id, quality, sourceId, mediaType]);

  // Orientation handling for iOS fullscreen
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
  // add a new state
  const [headers, setHeaders] = useState<Record<string, string>>({});
  // Progress tracking for torrents if needed
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

  const handleBuffer = ({ isBuffering }: { isBuffering: boolean }) => {
    setIsBuffering(isBuffering);
  };

  const handleClose = () => {
    setPlaying(false);
    navigation.goBack();
  };

  const toggleMiniPlayer = () => {
    if (!miniPlayer.visible) {
      // Create mini player data with only available properties
      const miniPlayerData = {
        visible: true,
        videoUrl: streamUrl,
        title: videoTitle,
        mediaType,
        id,
        sourceId,
        quality,
      };
      setMiniPlayer(miniPlayerData);
    } else {
      setMiniPlayer({ ...miniPlayer, visible: false });
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

  const retryStream = () => {
    setError(null);
    setupStream();
  };

  return (
    <View style={styles.container}>
      {/* Source and Quality Controls */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.titleText} numberOfLines={1}>
          {videoTitle}
        </Text>
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
      </View>

      {/* Source info */}
      {sourceName && (
        <View style={styles.sourceInfo}>
          <Text style={styles.sourceText}>Source: {sourceName}</Text>
        </View>
      )}

      {/* Buffering indicator */}
      {isBuffering && (
        <View style={styles.bufferContainer}>
          <ActivityIndicator size="large" color="#7d0b02" />
          <Text style={styles.bufferText}>
            Buffering...
            {infoHash && `(${progress.toFixed(1)}% downloaded)`}
          </Text>
        </View>
      )}

      {/* Loading and error states */}
      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#7d0b02" />
          <Text style={styles.loaderText}>Loading Video...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          {/* Show debug info in dev mode */}
          {__DEV__ && <Text style={styles.debugText}>{debugInfo}</Text>}
          <TouchableOpacity onPress={retryStream} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        // Video player
        <Video
          source={{
            uri: streamUrl,
            headers: {
              ...headers,
              "Cache-Control": "max-age=6048000",
              "Accept-Encoding": "identity",
            },
            type: streamType === "hls" ? "m3u8" : undefined,
          }}
          style={videoStyle}
          controls
          resizeMode="contain"
          paused={!isPlaying}
          ref={videoRef}
          onError={(err) => {
            console.error("Video playback error:", JSON.stringify(err));
            let errorMsg;

            if (err.error && err.error.code) {
              errorMsg = `Code: ${err.error.code}, ${
                err.error.localizedDescription || "Unknown error"
              }`;
            } else if (err.error) {
              errorMsg = `Error: ${JSON.stringify(err.error)}`;
            } else {
              errorMsg = `Failed to play video from ${sourceName}. URL may be invalid or inaccessible.`;
            }

            // Add more debug info
            setDebugInfo(
              `Stream URL: ${streamUrl.substring(
                0,
                50
              )}...\nError details: ${JSON.stringify(err)}`
            );
            setError(errorMsg);

            // Alert with actionable information
            Alert.alert(
              "Playback Error",
              `${errorMsg}\n\nWould you like to try a different quality setting?`,
              [
                {
                  text: "Try SD Quality",
                  onPress: () => {
                    setQuality("sd");
                    setupStream();
                  },
                },
                {
                  text: "Retry",
                  onPress: () => setupStream(),
                },
                {
                  text: "Cancel",
                  style: "cancel",
                },
              ]
            );
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

      {/* Mini player controls */}
      <View style={styles.playerControls}>
        <TouchableOpacity
          onPress={toggleMiniPlayer}
          style={styles.controlButton}
        >
          <Ionicons
            name={miniPlayer.visible ? "expand-outline" : "contract-outline"}
            size={24}
            color="#fff"
          />
          <Text style={styles.controlText}>
            {miniPlayer.visible ? "Expand" : "Mini Player"}
          </Text>
        </TouchableOpacity>
      </View>

      {miniPlayer.visible && (
        <View style={styles.miniPlayerOverlay}>
          <TouchableOpacity
            onPress={toggleMiniPlayer}
            style={styles.miniPlayerButton}
          >
            <Ionicons name="expand-outline" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.miniPlayerButton}
          >
            <Ionicons name="close-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  video: {
    width: "100%",
    height: 300,
    backgroundColor: "#000",
  },
  fullscreenVideo: {
    position: "absolute",
    top: 0,
    left: 0,
    width: Dimensions.get("window").width,
    height: Dimensions.get("window").height,
    zIndex: 2,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  loaderText: {
    color: "#fff",
    marginTop: 10,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
    padding: 20,
  },
  errorText: {
    color: "red",
    fontSize: 16,
    marginBottom: 10,
    textAlign: "center",
  },
  debugText: {
    color: "#aaa",
    fontSize: 12,
    marginBottom: 20,
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: "#7d0b02",
    padding: 10,
    borderRadius: 5,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 40 : 20,
    paddingHorizontal: 10,
    paddingBottom: 10,
    backgroundColor: "rgba(0,0,0,0.7)",
    zIndex: 3,
  },
  headerButton: {
    padding: 10,
  },
  titleText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    flex: 1,
    textAlign: "center",
    marginHorizontal: 10,
  },
  qualityControls: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  qualityButton: {
    backgroundColor: "#444",
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginHorizontal: 5,
    borderRadius: 5,
  },
  activeQuality: {
    backgroundColor: "#7d0b02",
  },
  qualityButtonText: {
    color: "#fff",
    fontSize: 14,
  },
  bufferContainer: {
    position: "absolute",
    top: "45%",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 4,
  },
  bufferText: {
    color: "#fff",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 5,
  },
  sourceInfo: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
  },
  sourceText: {
    color: "#ddd",
    fontSize: 14,
  },
  playerControls: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    zIndex: 3,
  },
  controlButton: {
    backgroundColor: "rgba(0,0,0,0.7)",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
  },
  controlText: {
    color: "#fff",
    marginLeft: 5,
  },
  miniPlayerOverlay: {
    position: "absolute",
    bottom: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    width: 100,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 20,
    padding: 5,
    zIndex: 4,
  },
  miniPlayerButton: {
    padding: 8,
  },
});

export default StreamVideo;
