import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar,
  Dimensions,
  ActivityIndicator,
  Platform,
  BackHandler,
  Animated,
  Alert
} from "react-native";
import { Video, ResizeMode, AVPlaybackStatus, Audio } from "expo-av";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as ScreenOrientation from "expo-screen-orientation";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { RootStackParamList } from "../../types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "LivePlayer">;

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

// Constants for better control
const CONTROLS_TIMEOUT = 5000; // Increased from 3000 for better UX
const RETRY_DELAY = 2000;
const MAX_RETRIES = 3;

export default function PlayerScreen({ navigation }: Props) {
  const { title = "", url = "" } = useLocalSearchParams<{
    title: string;
    url: string;
  }>();

  const router = useRouter();
  const videoRef = useRef<Video>(null);
  const isFocused = useIsFocused();

  // State management
  const [status, setStatus] = useState<AVPlaybackStatus | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [volume, setVolume] = useState(1.0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [error, setError] = useState<string | null>(null);
  const [streamStats, setStreamStats] = useState({
    bitrate: 0,
    bufferHealth: 0,
    droppedFrames: 0
  });

  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Configure audio session for background playback
  useEffect(() => {
    (async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false
        });
      } catch (e) {
        console.warn("Failed to set audio mode:", e);
      }
    })();
  }, []);

  // Auto-hide controls with better timeout management
  useEffect(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }

    if (status && status.isLoaded && status.isPlaying && showControls) {
      controlsTimeoutRef.current = setTimeout(hideControls, CONTROLS_TIMEOUT);
    }

    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [status, showControls]);

  const hideControls = () => {
    Animated.timing(controlsOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true
    }).start(() => setShowControls(false));
  };

  const showAndResetControls = () => {
    setShowControls(true);
    Animated.timing(controlsOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true
    }).start();
  };

  // Handle orientation
  useEffect(() => {
    let subscription: ScreenOrientation.Subscription;

    (async () => {
      const orientation = await ScreenOrientation.getOrientationAsync();
      handleOrientation(orientation);
    })();

    subscription = ScreenOrientation.addOrientationChangeListener(({ orientationInfo }) =>
      handleOrientation(orientationInfo.orientation)
    );

    return () => subscription.remove();
  }, []);

  const handleOrientation = (orientation: number) => {
    const landscape =
      orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
      orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
    setIsFullscreen(landscape);
    StatusBar.setHidden(landscape, "slide");
  };

  // Pause when navigating away
  useEffect(() => {
    if (!isFocused && status && status.isLoaded && status.isPlaying) {
      videoRef.current?.pauseAsync();
    }
  }, [isFocused]);

  // Handle back button
  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        exitPlayer();
        return true;
      };
      const subscription = BackHandler.addEventListener("hardwareBackPress", onBack);
      return () => subscription.remove();
    }, [])
  );

  const exitPlayer = async () => {
    try {
      await videoRef.current?.pauseAsync();
      await videoRef.current?.unloadAsync();
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      StatusBar.setHidden(false, "slide");
    } catch (e) {
      console.warn("Error cleaning up player:", e);
    }
    router.back();
  };

  const onPlaybackStatusUpdate = (playbackStatus: AVPlaybackStatus) => {
    setStatus(playbackStatus);

    if (playbackStatus.isLoaded) {
      setIsLoading(false);
      setError(null);
      setRetryCount(0);

      // Update stream stats for HLS
      if ("playableDurationMillis" in playbackStatus && playbackStatus.playableDurationMillis !== undefined) {
        const bufferHealth = playbackStatus.playableDurationMillis - playbackStatus.positionMillis;
        setStreamStats(prev => ({
          ...prev,
          bufferHealth: Math.round(bufferHealth / 1000) // Convert to seconds
        }));
      }
    } else if ("error" in playbackStatus && playbackStatus.error) {
      handlePlaybackError(playbackStatus.error);
    }
  };

  const handlePlaybackError = async (errorMsg: string) => {
    console.error("Playback error:", errorMsg);
    setError(errorMsg);
    setIsLoading(false);

    // Auto-retry for network errors
    if (
      retryCount < MAX_RETRIES &&
      (errorMsg.includes("network") ||
        errorMsg.includes("timeout") ||
        errorMsg.includes("404") ||
        errorMsg.includes("500"))
    ) {
      setRetryCount(prev => prev + 1);
      setTimeout(() => {
        reloadStream();
      }, RETRY_DELAY);
    }
  };

  const reloadStream = async () => {
    try {
      setIsLoading(true);
      setError(null);
      await videoRef.current?.unloadAsync();
      await videoRef.current?.loadAsync(
        { uri: url },
        {
          shouldPlay: true,
          volume: volume,
          rate: playbackRate
        }
      );
    } catch (e) {
      console.error("Failed to reload stream:", e);
      setError("Failed to reload stream");
    }
  };

  const togglePlayPause = () => {
    if (status && status.isLoaded) {
      status.isPlaying ? videoRef.current?.pauseAsync() : videoRef.current?.playAsync();
      showAndResetControls();
    }
  };

  const toggleMute = () => {
    if (status && status.isLoaded && "isMuted" in status) {
      const newMuted = !status.isMuted;
      videoRef.current?.setIsMutedAsync(newMuted);
      if (!newMuted) {
        videoRef.current?.setVolumeAsync(volume);
      }
      showAndResetControls();
    }
  };

  const adjustVolume = (value: number) => {
    setVolume(value);
    videoRef.current?.setVolumeAsync(value);
    showAndResetControls();
  };

  const toggleFullscreen = () => {
    const lock = isFullscreen
      ? ScreenOrientation.OrientationLock.PORTRAIT_UP
      : ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT;
    ScreenOrientation.lockAsync(lock);
    showAndResetControls();
  };

  const seek = (value: number) => {
    // Only allow seeking for non-live content
    if (
      status &&
      status.isLoaded &&
      "durationMillis" in status &&
      status.durationMillis !== undefined &&
      status.durationMillis > 0
    ) {
      videoRef.current?.setPositionAsync(value);
      showAndResetControls();
    }
  };

  const skipForward = () => {
    if (status && status.isLoaded && "positionMillis" in status && "durationMillis" in status) {
      const newPosition = Math.min(status.positionMillis + 10000, status.durationMillis || status.positionMillis);
      videoRef.current?.setPositionAsync(newPosition);
      showAndResetControls();
    }
  };

  const skipBackward = () => {
    if (status && status.isLoaded && "positionMillis" in status) {
      const newPosition = Math.max(status.positionMillis - 10000, 0);
      videoRef.current?.setPositionAsync(newPosition);
      showAndResetControls();
    }
  };

  const formatTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const isLiveStream = !status || !status.isLoaded || !("durationMillis" in status) || status.durationMillis === 0;

  // Error screen
  if (error && retryCount >= MAX_RETRIES) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="warning-outline" size={64} color="#FF6B35" />
        <Text style={styles.errorText}>Unable to load stream</Text>
        <Text style={styles.errorSubtext}>{error}</Text>
        <View style={styles.errorActions}>
          <Pressable onPress={reloadStream} style={styles.errorButton}>
            <Ionicons name="refresh" size={20} color="#fff" />
            <Text style={styles.errorButtonText}>Retry</Text>
          </Pressable>
          <Pressable onPress={exitPlayer} style={[styles.errorButton, styles.errorButtonSecondary]}>
            <Text style={styles.errorButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Video
        ref={videoRef}
        source={{ uri: url }}
        style={styles.video}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay
        volume={volume}
        rate={playbackRate}
        onPlaybackStatusUpdate={onPlaybackStatusUpdate}
        useNativeControls={false}
        progressUpdateIntervalMillis={1000}
      />

      <Pressable style={styles.touchArea} onPress={showAndResetControls}>
        {showControls && (
          <Animated.View style={[styles.controls, { opacity: controlsOpacity }]}>
            {/* Top Bar */}
            <View style={styles.topBar}>
              <Pressable onPress={exitPlayer} style={styles.iconBtn}>
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </Pressable>
              <View style={styles.titleContainer}>
                <Text numberOfLines={1} style={styles.title}>
                  {title}
                </Text>
                {isLiveStream && (
                  <View style={styles.liveBadge}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText}>LIVE</Text>
                  </View>
                )}
              </View>
              <Pressable onPress={toggleFullscreen} style={styles.iconBtn}>
                <Ionicons name={isFullscreen ? "contract" : "expand"} size={24} color="#fff" />
              </Pressable>
            </View>

            {/* Center Controls */}
            <View style={styles.centerBar}>
              {isLoading || (status && status.isLoaded && status.isBuffering) ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#FF6B35" />
                  {retryCount > 0 && (
                    <Text style={styles.retryText}>
                      Retrying... ({retryCount}/{MAX_RETRIES})
                    </Text>
                  )}
                </View>
              ) : (
                <View style={styles.centerControls}>
                  {!isLiveStream && (
                    <Pressable onPress={skipBackward} style={styles.skipBtn}>
                      <Ionicons name="play-back" size={32} color="#fff" />
                    </Pressable>
                  )}

                  <Pressable onPress={togglePlayPause} style={styles.playBtn}>
                    <Ionicons
                      name={status && status.isLoaded && status.isPlaying ? "pause" : "play"}
                      size={48}
                      color="#fff"
                    />
                  </Pressable>

                  {!isLiveStream && (
                    <Pressable onPress={skipForward} style={styles.skipBtn}>
                      <Ionicons name="play-forward" size={32} color="#fff" />
                    </Pressable>
                  )}
                </View>
              )}
            </View>

            {/* Bottom Bar */}
            <View style={styles.bottomBar}>
              <View style={styles.progressContainer}>
                {!isLiveStream && status && status.isLoaded && (
                  <View style={styles.timeInfo}>
                    <Text style={styles.timeText}>
                      {formatTime(status.positionMillis)} / {formatTime(status.durationMillis || 0)}
                    </Text>
                  </View>
                )}

                {!isLiveStream && (
                  <Slider
                    style={styles.slider}
                    minimumValue={0}
                    maximumValue={status?.isLoaded && "durationMillis" in status ? status.durationMillis : 1}
                    value={status?.isLoaded && "positionMillis" in status ? status.positionMillis : 0}
                    minimumTrackTintColor="#FF6B35"
                    maximumTrackTintColor="rgba(255,255,255,0.3)"
                    thumbTintColor="#FF6B35"
                    onSlidingComplete={seek}
                    disabled={isLiveStream}
                  />
                )}

                {isLiveStream && (
                  <View style={styles.liveStreamInfo}>
                    <Text style={styles.bufferHealth}>Buffer: {streamStats.bufferHealth}s</Text>
                  </View>
                )}
              </View>

              <View style={styles.bottomControls}>
                <Pressable onPress={toggleMute} style={styles.iconBtn}>
                  <Ionicons
                    name={
                      status && status.isLoaded && "isMuted" in status && status.isMuted ? "volume-mute" : "volume-high"
                    }
                    size={24}
                    color="#fff"
                  />
                </Pressable>

                {status && status.isLoaded && "isMuted" in status && !status.isMuted && (
                  <Slider
                    style={styles.volumeSlider}
                    minimumValue={0}
                    maximumValue={1}
                    value={volume}
                    minimumTrackTintColor="#FF6B35"
                    maximumTrackTintColor="rgba(255,255,255,0.3)"
                    thumbTintColor="#FF6B35"
                    onValueChange={adjustVolume}
                  />
                )}

                <Pressable onPress={reloadStream} style={styles.iconBtn}>
                  <Ionicons name="refresh" size={20} color="#fff" />
                </Pressable>
              </View>
            </View>
          </Animated.View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000"
  },
  video: {
    flex: 1,
    backgroundColor: "#000"
  },
  touchArea: {
    ...StyleSheet.absoluteFillObject
  },
  controls: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.3)"
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 50 : 20,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: "rgba(0,0,0,0.5)"
  },
  titleContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12
  },
  title: {
    flex: 1,
    color: "#fff",
    fontSize: 18,
    fontWeight: "600"
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF6B35",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 12
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#fff",
    marginRight: 4
  },
  liveText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold"
  },
  centerBar: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  centerControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center"
  },
  playBtn: {
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 50,
    padding: 20,
    marginHorizontal: 20,
    elevation: 3
  },
  skipBtn: {
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 30,
    padding: 12
  },
  bottomBar: {
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === "ios" ? 20 : 12,
    paddingTop: 12
  },
  progressContainer: {
    marginBottom: 8
  },
  timeInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8
  },
  timeText: {
    color: "#fff",
    fontSize: 12
  },
  slider: {
    height: 40
  },
  volumeSlider: {
    width: 100,
    height: 40,
    marginHorizontal: 8
  },
  bottomControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  iconBtn: {
    padding: 8,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 20
  },
  loadingContainer: {
    alignItems: "center"
  },
  retryText: {
    color: "#fff",
    fontSize: 12,
    marginTop: 8
  },
  liveStreamInfo: {
    alignItems: "center",
    paddingVertical: 8
  },
  bufferHealth: {
    color: "#4CAF50",
    fontSize: 12
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
    padding: 20
  },
  errorText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "600",
    marginTop: 16
  },
  errorSubtext: {
    color: "#888",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center"
  },
  errorActions: {
    flexDirection: "row",
    marginTop: 24
  },
  errorButton: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#FF6B35",
    borderRadius: 8
  },
  errorButtonSecondary: {
    backgroundColor: "#333"
  },
  errorButtonText: {
    color: "#fff",
    fontSize: 16,
    marginLeft: 8
  }
});
