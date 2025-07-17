import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar,
  Dimensions,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/types/navigation";
import * as ScreenOrientation from "expo-screen-orientation";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { RouteProp } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";

type Props = RouteProp<RootStackParamList, "LivePlayer">;

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

export default function PlayerScreen() {
  const { title, url } = useLocalSearchParams<{ title: string; url: string }>();
  const router = useRouter();
  const videoRef = useRef<Video>(null);

  const [isPlaying, setIsPlaying] = useState(false); // Changed from true to false initially
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);

  const controlsTimeoutRef = useRef<NodeJS.Timeout>();

  // Handle screen orientation
  useFocusEffect(
    React.useCallback(() => {
      const setupOrientation = async () => {
        if (isFullscreen) {
          await ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.LANDSCAPE
          );
        } else {
          await ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.PORTRAIT
          );
        }
      };

      setupOrientation();

      return () => {
        ScreenOrientation.unlockAsync();
      };
    }, [isFullscreen])
  );

  // Auto-hide controls
  useEffect(() => {
    if (showControls && isPlaying && !isBuffering) {
      // Added !isBuffering condition
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }

    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [showControls, isPlaying, isBuffering]); // Added isBuffering to dependencies

  const handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setIsLoading(false);
      setIsPlaying(status.isPlaying || false);
      setIsMuted(status.isMuted || false);

      // Better buffering state management
      if ("isBuffering" in status) {
        setIsBuffering(status.isBuffering || false);
      } else {
        setIsBuffering(false);
      }

      // Clear error if playback is successful
      if (error) {
        setError(null);
      }
    } else if (status.error) {
      setError(status.error);
      setIsLoading(false);
      setIsBuffering(false);
    }
  };

  const togglePlayPause = async () => {
    try {
      if (isPlaying) {
        await videoRef.current?.pauseAsync();
      } else {
        await videoRef.current?.playAsync();
      }
    } catch (err) {
      console.error("Error toggling play/pause:", err);
    }
  };

  const toggleMute = async () => {
    try {
      await videoRef.current?.setIsMutedAsync(!isMuted);
    } catch (err) {
      console.error("Error toggling mute:", err);
    }
  };

  const toggleFullscreen = async () => {
    setIsFullscreen(!isFullscreen);
  };

  const handleVideoPress = () => {
    setShowControls(true);
  };

  const handleGoBack = () => {
    router.back();
  };

  const handleReload = async () => {
    try {
      setError(null);
      setIsLoading(true);
      setIsBuffering(false);
      setIsPlaying(false);
      await videoRef.current?.unloadAsync();
      await videoRef.current?.loadAsync({ uri: url }, {}, false);
    } catch (err) {
      setError("Failed to reload stream");
      setIsLoading(false);
    }
  };

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#1A1A1A" />
        <View style={styles.errorContent}>
          <Ionicons name="warning-outline" size={64} color="#FF6B35" />
          <Text style={styles.errorTitle}>Stream Unavailable</Text>
          <Text style={styles.errorMessage}>
            Unable to load the live stream. Please check your connection and try
            again.
          </Text>
          <View style={styles.errorActions}>
            <Pressable style={styles.retryButton} onPress={handleReload}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
            <Pressable style={styles.backButton} onPress={handleGoBack}>
              <Text style={styles.backButtonText}>Go Back</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, isFullscreen && styles.fullscreenContainer]}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor="#000000"
        hidden={isFullscreen}
      />

      <View
        style={[styles.videoContainer, isFullscreen && styles.fullscreenVideo]}
      >
        <Video
          ref={videoRef}
          source={{ uri: url }}
          rate={1.0}
          volume={1.0}
          isMuted={isMuted}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={true}
          isLooping={false}
          style={styles.video}
          onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
          progressUpdateIntervalMillis={500} // Added for better status updates
        />

        {/* Video Overlay */}
        <Pressable style={styles.videoOverlay} onPress={handleVideoPress}>
          {/* Loading/Buffering Indicator - Fixed condition */}
          {(isLoading || (isBuffering && !isPlaying)) && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#FF6B35" />
              <Text style={styles.loadingText}>
                {isLoading ? "Loading..." : "Buffering..."}
              </Text>
            </View>
          )}

          {/* Controls */}
          {showControls && !isLoading && (
            <View style={styles.controlsContainer}>
              {/* Top Controls */}
              <View style={styles.topControls}>
                <Pressable style={styles.backBtn} onPress={handleGoBack}>
                  <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
                </Pressable>
                <Text style={styles.videoTitle} numberOfLines={1}>
                  {title}
                </Text>
                <Pressable
                  style={styles.fullscreenBtn}
                  onPress={toggleFullscreen}
                >
                  <Ionicons
                    name={isFullscreen ? "contract" : "expand"}
                    size={24}
                    color="#FFFFFF"
                  />
                </Pressable>
              </View>

              {/* Center Controls */}
              <View style={styles.centerControls}>
                <Pressable style={styles.playButton} onPress={togglePlayPause}>
                  <Ionicons
                    name={isPlaying ? "pause" : "play"}
                    size={48}
                    color="#FFFFFF"
                  />
                </Pressable>
              </View>

              {/* Bottom Controls */}
              <View style={styles.bottomControls}>
                <View style={styles.liveIndicator}>
                  <View
                    style={[
                      styles.liveDot,
                      isBuffering && styles.liveDotBuffering,
                    ]}
                  />
                  <Text style={styles.liveText}>
                    {isBuffering ? "BUFFERING" : "LIVE"}
                  </Text>
                </View>

                <Pressable style={styles.muteButton} onPress={toggleMute}>
                  <Ionicons
                    name={isMuted ? "volume-mute" : "volume-high"}
                    size={24}
                    color="#FFFFFF"
                  />
                </Pressable>
              </View>
            </View>
          )}
        </Pressable>
      </View>

      {/* Info Panel (only visible in portrait mode) */}
      {!isFullscreen && (
        <View style={styles.infoPanel}>
          <View style={styles.infoHeader}>
            <Text style={styles.infoTitle}>{title}</Text>
            <View style={styles.statusContainer}>
              <View
                style={[
                  styles.liveBadge,
                  isBuffering && styles.liveBadgeBuffering,
                ]}
              >
                <View
                  style={[
                    styles.liveDotSmall,
                    isBuffering && styles.liveDotBuffering,
                  ]}
                />
                <Text style={styles.liveBadgeText}>
                  {isBuffering ? "BUFFERING" : "LIVE"}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.infoContent}>
            <Text style={styles.infoDescription}>
              Watch Live Channels and Sports High Quality @ ZileWatch
            </Text>

            <View style={styles.infoActions}>
              <Pressable style={styles.infoButton} onPress={toggleFullscreen}>
                <Ionicons name="expand" size={20} color="#FF6B35" />
                <Text style={styles.infoButtonText}>Fullscreen</Text>
              </Pressable>

              <Pressable style={styles.infoButton} onPress={handleReload}>
                <Ionicons name="refresh" size={20} color="#FF6B35" />
                <Text style={styles.infoButtonText}>Reload</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1A1A1A",
  },
  fullscreenContainer: {
    backgroundColor: "#000000",
  },
  videoContainer: {
    width: screenWidth,
    height: screenWidth * (9 / 16), // 16:9 aspect ratio
    backgroundColor: "#000000",
    position: "relative",
  },
  fullscreenVideo: {
    width: screenHeight,
    height: screenWidth,
  },
  video: {
    width: "100%",
    height: "100%",
  },
  videoOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingOverlay: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#FFFFFF",
    fontSize: 16,
    marginTop: 12,
    fontWeight: "500",
  },
  controlsContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  topControls: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 50 : 20,
    paddingBottom: 16,
  },
  backBtn: {
    padding: 8,
  },
  videoTitle: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
    marginHorizontal: 16,
  },
  fullscreenBtn: {
    padding: 8,
  },
  centerControls: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  playButton: {
    backgroundColor: "rgba(255, 107, 53, 0.8)",
    borderRadius: 50,
    padding: 20,
  },
  bottomControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 107, 53, 0.9)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
    marginRight: 8,
  },
  liveDotBuffering: {
    backgroundColor: "#FFA500",
  },
  liveText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  muteButton: {
    padding: 8,
  },
  infoPanel: {
    flex: 1,
    padding: 20,
  },
  infoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  infoTitle: {
    flex: 1,
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginRight: 16,
  },
  statusContainer: {
    alignItems: "flex-end",
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF6B35",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  liveBadgeBuffering: {
    backgroundColor: "#FFA500",
  },
  liveDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
    marginRight: 6,
  },
  liveBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  infoContent: {
    flex: 1,
  },
  infoDescription: {
    fontSize: 16,
    color: "#CCCCCC",
    lineHeight: 24,
    marginBottom: 24,
  },
  infoActions: {
    flexDirection: "row",
    gap: 16,
  },
  infoButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2A2A2A",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FF6B35",
  },
  infoButtonText: {
    color: "#FF6B35",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 8,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: "#1A1A1A",
    justifyContent: "center",
    alignItems: "center",
  },
  errorContent: {
    alignItems: "center",
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginTop: 16,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 16,
    color: "#CCCCCC",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
  },
  errorActions: {
    flexDirection: "row",
    gap: 16,
  },
  retryButton: {
    backgroundColor: "#FF6B35",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  backButton: {
    backgroundColor: "#2A2A2A",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#555555",
  },
  backButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
