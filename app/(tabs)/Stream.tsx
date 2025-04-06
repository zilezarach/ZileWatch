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
  StatusBar,
} from "react-native";
import Video, { VideoRef } from "react-native-video";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { RootStackParamList } from "@/types/navigation";
import Constants from "expo-constants";
import * as ScreenOrientation from "expo-screen-orientation";
import { Ionicons } from "@expo/vector-icons";
import { useMiniPlayer } from "../../context/MiniPlayerContext";
import streamingService from "@/utils/streamingService";

const { width, height } = Dimensions.get("window");

type StreamRouteProp = RouteProp<RootStackParamList, "Stream">;

const StreamVideo = () => {
  const route = useRoute<StreamRouteProp>();
  const {
    mediaType = "movie",
    id,
    sourceId,
    videoTitle,
    season = "0",
    episode = "0",
    episodeId,
    // New props that might be passed directly
    streamUrl: directStreamUrl,
    subtitles: directSubtitles,
    sourceName: directSourceName,
  } = route.params;

  const navigation = useNavigation();
  const videoRef = useRef<VideoRef>(null);

  const [quality, setQuality] = useState<"hd" | "sd">("hd");
  const [streamUrl, setStreamUrl] = useState<string>(directStreamUrl || "");
  const [sourceName, setSourceName] = useState<string>(directSourceName || "");
  const [isLoading, setLoading] = useState<boolean>(!directStreamUrl);
  const [isPlaying, setPlaying] = useState<boolean>(true);
  const [isLandscape, setIsLandscape] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [debugInfo, setDebugInfo] = useState<string>("");
  const [streamType, setStreamType] = useState<string | null>(null);
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [subtitles, setSubtitles] = useState<any[]>(directSubtitles || []);
  const { miniPlayer, setMiniPlayer } = useMiniPlayer();

  // Setup Stream
  const setupStream = async () => {
    try {
      // If we already have a direct stream URL, skip setup
      if (directStreamUrl) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      // Log params for debugging
      console.log("Stream setup params:", {
        mediaType,
        id,
        sourceId,
        season,
        episode,
        episodeId,
        quality,
      });

      if (mediaType === "movie") {
        // Get movie streaming info
        const streamingInfo = await streamingService.getMovieStreamingInfo(
          id.toString(),
          {
            serverId: sourceId,
            quality,
          }
        );

        if (streamingInfo && streamingInfo.streamUrl) {
          setStreamUrl(streamingInfo.streamUrl);
          setSourceName(streamingInfo.selectedServer?.name || "Unknown Source");
          setStreamType(streamingInfo.sources?.sources?.[0]?.type || "mp4");
          setHeaders(streamingInfo.sources?.headers || {});
          setSubtitles(streamingInfo.subtitles || []);
          setDebugInfo(
            `Movie Stream URL: ${streamingInfo.streamUrl.substring(0, 50)}...`
          );
        } else {
          throw new Error("No movie stream URL returned from API");
        }
      } else {
        // Get episode streaming info
        const streamingInfo = await streamingService.getEpisodeStreamingInfo(
          id.toString(),
          episodeId || episode,
          {
            serverId: sourceId,
            quality,
          }
        );

        if (streamingInfo && streamingInfo.streamUrl) {
          setStreamUrl(streamingInfo.streamUrl);
          setSourceName(streamingInfo.selectedServer?.name || "Unknown Source");
          setStreamType(streamingInfo.sources?.sources?.[0]?.type || "mp4");
          setHeaders(streamingInfo.sources?.headers || {});
          setSubtitles(streamingInfo.subtitles || []);
          setDebugInfo(
            `Episode Stream URL: ${streamingInfo.streamUrl.substring(0, 50)}...`
          );
        } else {
          throw new Error("No episode stream URL returned from API");
        }
      }
      setError(null);
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
    if (!id && !directStreamUrl) {
      Alert.alert("Error", "Invalid media reference.");
      navigation.goBack();
    } else {
      setupStream();
    }

    // Set orientation unlock when component mounts
    const lockOrientation = async () => {
      await ScreenOrientation.unlockAsync();
    };

    lockOrientation();

    // Clear listeners and lock orientation back when component unmounts
    return () => {
      const resetOrientation = async () => {
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT
        );
      };

      resetOrientation();
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

  const handleProgress = (data: {
    currentTime: number;
    playableDuration: number;
  }) => {
    if (data.playableDuration > 0) {
      setProgress((data.currentTime / data.playableDuration) * 100);
    }
  };

  const togglePlayPause = () => {
    setPlaying(!isPlaying);
  };

  const handleError = (err: any) => {
    console.error("Video Error:", err);
    setError(
      `Video playback error: ${err.error?.errorString || "Unknown error"}`
    );
  };

  const retryStream = () => {
    setError(null);
    setupStream();
  };

  const videoStyle =
    Platform.OS === "android" && isLandscape
      ? [styles.video, styles.fullscreenVideo]
      : styles.video;

  useEffect(() => {
    // Hide status bar in fullscreen mode
    if (isLandscape) {
      StatusBar.setHidden(true);
    } else {
      StatusBar.setHidden(false);
    }
  }, [isLandscape]);

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

      {/* Loading state */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#7d0b02" />
          <Text style={styles.loadingText}>Loading stream...</Text>
        </View>
      ) : error ? (
        // Error state
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={retryStream}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.retryButton, { marginTop: 10 }]}
            onPress={handleClose}
          >
            <Text style={styles.retryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        // Video player
        <View style={styles.videoContainer}>
          <Video
            ref={videoRef}
            source={{
              uri: streamUrl,
              headers,
              type: streamType || undefined,
            }}
            style={videoStyle}
            controls={true}
            paused={!isPlaying}
            resizeMode="contain"
            onBuffer={handleBuffer}
            onError={handleError}
            onProgress={handleProgress}
            onLoad={() => setIsBuffering(false)}
            fullscreen={isLandscape}
            fullscreenOrientation="landscape"
            poster="https://via.placeholder.com/1920x1080?text=Loading..."
            posterResizeMode="cover"
            ignoreSilentSwitch="ignore"
            playWhenInactive={false}
            playInBackground={false}
            repeat={false}
            selectedTextTrack={{
              type: "index", // or 'language',
              value: 0, // value is language code when type is 'language'
            }}
            textTracks={subtitles.map((sub, index) => ({
              title: sub.label || `Subtitle ${index + 1}`,
              language: sub.label || `lang-${index}`,
              type: "text/vtt",
              uri: sub.file,
            }))}
          />

          {/* Buffering indicator overlay */}
          {isBuffering && (
            <View style={styles.bufferOverlay}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.bufferText}>Buffering...</Text>
            </View>
          )}

          {/* Mini player toggle button */}
          <TouchableOpacity
            style={styles.miniPlayerButton}
            onPress={toggleMiniPlayer}
          >
            <Ionicons
              name={miniPlayer.visible ? "expand" : "contract"}
              size={24}
              color="#fff"
            />
          </TouchableOpacity>

          {/* Play/Pause overlay button (shown briefly on tap) */}
          <TouchableOpacity
            style={styles.playPauseOverlay}
            onPress={togglePlayPause}
            activeOpacity={1}
          >
            {/* Usually empty, just used for capturing taps */}
          </TouchableOpacity>
        </View>
      )}

      {/* Debug info in development */}
      {__DEV__ && debugInfo ? (
        <View style={styles.debugContainer}>
          <Text style={styles.debugText}>{debugInfo}</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#121212",
  },
  headerButton: {
    padding: 8,
  },
  titleText: {
    flex: 1,
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
    marginHorizontal: 16,
  },
  qualityControls: {
    flexDirection: "row",
  },
  qualityButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    marginLeft: 8,
    backgroundColor: "#333",
  },
  activeQuality: {
    backgroundColor: "#7d0b02",
  },
  qualityButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  sourceInfo: {
    backgroundColor: "#121212",
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  sourceText: {
    color: "#aaa",
    fontSize: 14,
  },
  videoContainer: {
    flex: 1,
    position: "relative",
    backgroundColor: "#000",
  },
  video: {
    flex: 1,
    backgroundColor: "#000",
  },
  fullscreenVideo: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    height,
    width,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#121212",
  },
  loadingText: {
    marginTop: 16,
    color: "#fff",
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#121212",
  },
  errorText: {
    fontSize: 16,
    color: "#ff6b6b",
    textAlign: "center",
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: "#7d0b02",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  bufferOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  bufferText: {
    color: "#fff",
    marginTop: 12,
    fontSize: 16,
  },
  miniPlayerButton: {
    position: "absolute",
    bottom: 20,
    right: 20,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    padding: 12,
    borderRadius: 30,
  },
  playPauseOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  debugContainer: {
    padding: 16,
    backgroundColor: "#121212",
  },
  debugText: {
    color: "#777",
    fontSize: 12,
  },
  bufferContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    zIndex: 10,
  },
});

export default StreamVideo;
