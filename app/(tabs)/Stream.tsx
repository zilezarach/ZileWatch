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
import Video, { SelectedTrackType, VideoRef } from "react-native-video";
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
    // Direct stream info from navigation params
    streamUrl: directStreamUrl,
    subtitles: directSubtitles,
    sourceName: directSourceName,
  } = route.params;

  const navigation = useNavigation();
  const videoRef = useRef<VideoRef>(null);

  // State management
  const [streamUrl, setStreamUrl] = useState<string>(directStreamUrl || "");
  const [sourceName, setSourceName] = useState<string>(directSourceName || "");
  const [isLoading, setLoading] = useState<boolean>(!directStreamUrl);
  const [isPlaying, setPlaying] = useState<boolean>(true);
  const [isLandscape, setIsLandscape] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [debugInfo, setDebugInfo] = useState<string>("");
  const [streamType] = useState<string>("hls");
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [subtitles, setSubtitles] = useState<any[]>(directSubtitles || []);
  const [availableSources, setAvailableSources] = useState<any[]>([]);

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
      });

      let streamingInfo;

      if (mediaType === "movie") {
        // Get movie streaming info
        streamingInfo = await streamingService.getMovieStreamingUrl(
          id.toString()
        );
      } else {
        // Get episode streaming info
        streamingInfo = await streamingService.getEpisodeStreamingUrl(
          id.toString(),
          episodeId?.toString() || episode?.toString(),
          sourceId
        );

        // Fetch available sources for this episode
        if (episodeId) {
          try {
            const sourcesData = await streamingService.getEpisodeStreamingUrl(
              id.toString(),
              episodeId.toString()
            );

            if (sourcesData && sourcesData.selectedServer) {
              setAvailableSources([sourcesData.selectedServer]);
            }
          } catch (error) {
            console.warn("Failed to fetch additional sources:", error);
          }
        }
      }

      // Check if we have streaming info
      if (!streamingInfo || !streamingInfo.streamUrl) {
        throw new Error("No stream URL returned from API");
      }

      setStreamUrl(streamingInfo.streamUrl);
      setSourceName(streamingInfo.selectedServer?.name || "Unknown Source");
      setSubtitles(streamingInfo.subtitles || []);
      setDebugInfo(
        `Stream URL: ${streamingInfo.streamUrl.substring(0, 50)}...`
      );
    } catch (err: any) {
      console.error("Stream setup failed:", err);
      const errorMessage =
        err.message || "Failed to load Stream. Please try again";
      setDebugInfo(debugInfo + "\nError: " + errorMessage);
      setError(errorMessage);
      Alert.alert("Error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Change stream source
  const changeSource = async (newSourceId: string) => {
    try {
      setLoading(true);
      setError(null);

      // Pause current playback
      setPlaying(false);

      const selectedServer = availableSources.find((s) => s.id === newSourceId);
      if (!selectedServer) {
        throw new Error("Invalid source selected");
      }

      if (mediaType === "movie") {
        const streamingInfo = await streamingService.getMovieStreamingUrl(
          id.toString()
        );
        setStreamUrl(streamingInfo.streamUrl);
        setSubtitles(streamingInfo.subtitles || []);
        setSourceName(streamingInfo.selectedServer?.name || "Unknown Source");
      } else {
        const streamingInfo = await streamingService.getEpisodeStreamingUrl(
          id.toString(),
          episodeId?.toString() || episode?.toString(),
          newSourceId
        );

        if (!streamingInfo || !streamingInfo.streamUrl) {
          throw new Error("Failed to load source");
        }

        setStreamUrl(streamingInfo.streamUrl);
        setSubtitles(streamingInfo.subtitles || []);
        setSourceName(selectedServer.name || "Unknown Source");
      }

      // Resume playback with new source
      setPlaying(true);
    } catch (err: any) {
      console.error("Source change failed:", err);
      const errorMessage = err.message || "Failed to change source";
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
  }, [id, sourceId, mediaType]);

  // Orientation handling for fullscreen
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

  // Hide status bar in fullscreen mode
  useEffect(() => {
    if (isLandscape) {
      StatusBar.setHidden(true);
    } else {
      StatusBar.setHidden(false);
    }
  }, [isLandscape]);

  const handleBuffer = ({ isBuffering }: { isBuffering: boolean }) => {
    setIsBuffering(isBuffering);
  };

  const handleClose = () => {
    setPlaying(false);
    navigation.goBack();
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

  return (
    <View style={styles.container}>
      {/* Header with back button and title */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.titleText} numberOfLines={1}>
          {videoTitle}
        </Text>
      </View>

      {/* Source info and selector */}
      {sourceName && (
        <View style={styles.sourceInfo}>
          <Text style={styles.sourceText}>Source: {sourceName}</Text>

          {availableSources.length > 1 && (
            <View style={styles.sourceSelectorContainer}>
              {availableSources.map((source) => (
                <TouchableOpacity
                  key={source.id}
                  style={[
                    styles.sourceButton,
                    source.name === sourceName && styles.activeSourceButton,
                  ]}
                  onPress={() => changeSource(source.id)}
                  disabled={isLoading || source.name === sourceName}
                >
                  <Text
                    style={[
                      styles.sourceButtonText,
                      source.name === sourceName &&
                        styles.activeSourceButtonText,
                    ]}
                  >
                    {source.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
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
          {streamUrl ? (
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
              textTracks={subtitles}
              playWhenInactive={false}
              playInBackground={false}
              repeat={false}
            />
          ) : (
            <View style={styles.noStreamContainer}>
              <Text style={styles.noStreamText}>No stream URL available</Text>
            </View>
          )}

          {/* Buffering indicator overlay */}
          {isBuffering && (
            <View style={styles.bufferOverlay}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.bufferText}>Buffering...</Text>
            </View>
          )}
          {/* Play/Pause overlay button */}
          <TouchableOpacity
            style={styles.playPauseOverlay}
            onPress={togglePlayPause}
            activeOpacity={1}
          />
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
  sourceInfo: {
    backgroundColor: "#121212",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  sourceText: {
    color: "#aaa",
    fontSize: 14,
  },
  sourceSelectorContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
  },
  sourceButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    marginRight: 8,
    marginTop: 4,
    backgroundColor: "#2c2c2c",
  },
  activeSourceButton: {
    backgroundColor: "#7d0b02",
  },
  sourceButtonText: {
    color: "#ddd",
    fontSize: 12,
  },
  activeSourceButtonText: {
    color: "#fff",
    fontWeight: "bold",
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
  noStreamContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#121212",
  },
  noStreamText: {
    color: "#aaa",
    fontSize: 16,
  },
});

export default StreamVideo;
