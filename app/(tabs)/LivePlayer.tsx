import React, { useRef, useState, useEffect } from "react";
import {
  View,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  Text,
  SafeAreaView,
  Platform,
} from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { AppState } from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import * as ScreenOrientation from "expo-screen-orientation";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";

const { width, height } = Dimensions.get("window");

export default function PlayerScreen() {
  const { url, title } = useLocalSearchParams();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isLive, setIsLive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;

  // Create video player with the URL
  const player = useVideoPlayer(
    {
      uri: String(url),
      contentType: "hls",
    },
    (player) => {
      player.loop = false;
      player.play();
      player.bufferOptions = {
        waitsToMinimizeStalling: true,
        preferredForwardBufferDuration: 30,
      };
    },
  );

  // Hide tabs while focused
  useFocusEffect(
    React.useCallback(() => {
      navigation.getParent()?.setOptions({ tabBarStyle: { display: "none" } });
      return () => {
        navigation.getParent()?.setOptions({ tabBarStyle: undefined });
      };
    }, [navigation]),
  );

  useEffect(() => {
    ScreenOrientation.getOrientationAsync().then((orientation) => {
      const land =
        orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
        orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
      setIsLandscape(land);
      StatusBar.setHidden(land);
    });
    ScreenOrientation.unlockAsync();
    const sub = ScreenOrientation.addOrientationChangeListener((evt) => {
      const o = evt.orientationInfo.orientation;
      const land =
        o === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
        o === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
      setIsLandscape(land);
      StatusBar.setHidden(land);
    });
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
      ScreenOrientation.removeOrientationChangeListener(sub);
      StatusBar.setHidden(false);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", async (e) => {
      e.preventDefault();

      // Cleanup video player
      if (player) {
        try {
          player.pause();
          player.replace(null); // Unload the video
        } catch (err) {
          console.warn("Video cleanup failed:", err);
        }
      }

      try {
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT,
        );
      } catch (error) {
        console.warn("Failed to lock orientation", error);
      }

      navigation.dispatch(e.data.action);
    });

    return unsubscribe;
  }, [navigation, player]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state.match(/inactive|background/) && player) {
        try {
          player.pause();
        } catch (err) {
          console.warn("Failed to pause on background:", err);
        }
      } else if (state === "active" && player) {
        try {
          player.play();
        } catch (err) {
          console.warn("Failed to resume on foreground:", err);
        }
      }
    });

    return () => sub.remove();
  }, [player]);

  // Monitor player status
  useEffect(() => {
    if (!player) return;

    const statusInterval = setInterval(() => {
      const status = player.status;

      if (status === "loading") {
        setLoading(true);
        setError(null);
      } else if (status === "readyToPlay") {
        setLoading(false);
        setError(null);
        setRetryCount(0);

        // Detect if it's a live stream
        const duration = player.duration;
        setIsLive(!duration || duration === 0);
      } else if (status === "error") {
        setLoading(false);

        // Get error details
        const errorObj = (player as any).error;
        const errorMessage = errorObj?.message || "Playback failed";

        console.error("Video playback error:", errorMessage);

        // Check if recoverable
        const isRecoverable =
          errorMessage.includes("network") ||
          errorMessage.includes("timeout") ||
          errorMessage.includes("404") ||
          errorMessage.includes("503");

        if (isRecoverable && retryCount < maxRetries) {
          console.log(`🔄 Auto-retry ${retryCount + 1}/${maxRetries}`);
          setRetryCount((prev) => prev + 1);
          setTimeout(
            () => {
              handleRetry();
            },
            2000 * (retryCount + 1),
          );
        } else {
          setError(
            retryCount >= maxRetries
              ? "Stream unavailable after multiple attempts. Please try another channel."
              : `Playback failed: ${errorMessage}`,
          );
        }
      }
    }, 500);

    return () => clearInterval(statusInterval);
  }, [player, retryCount]);

  // Log the stream URL for debugging
  useEffect(() => {
    console.log("🎬 PlayerScreen received URL:", url);
    console.log("📺 Stream title:", title);
  }, [url, title]);

  const handleGoBack = async () => {
    if (player) {
      try {
        player.pause();
        player.replace(null);
      } catch (err) {
        console.warn("Failed to cleanup video:", err);
      }
    }
    try {
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT,
      );
    } catch (error) {
      console.warn("Failed to lock orientation", error);
    }
    navigation.goBack();
  };

  const handleRetry = () => {
    console.log("🔄 Retrying stream load...");
    setError(null);
    setLoading(true);

    if (player) {
      try {
        // Replace with the same URL to reload
        player.replace(String(url));
        player.play();
        console.log("✅ Stream reloaded successfully");
      } catch (err) {
        console.error("❌ Failed to reload stream:", err);
        setError(
          "Failed to load stream. Please try again or select another channel.",
        );
        setLoading(false);
      }
    }
  };

  const getCurrentTime = () => {
    return new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      {!isLandscape && (
        <SafeAreaView style={styles.headerContainer}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={handleGoBack}
              style={styles.backButton}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.titleContainer}>
              <Text style={styles.title} numberOfLines={1}>
                {title || "Live Channel"}
              </Text>
              {isLive && (
                <View style={styles.liveIndicator}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                  <Text style={styles.timeText}>• {getCurrentTime()}</Text>
                </View>
              )}
            </View>
          </View>
        </SafeAreaView>
      )}

      {/* Video Container */}
      <View
        style={
          isLandscape ? styles.fullscreenVideoContainer : styles.videoContainer
        }
      >
        {loading && !error && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF5722" />
            <Text style={styles.loadingText}>
              {retryCount > 0
                ? `Retrying stream... (${retryCount}/${maxRetries})`
                : "Loading stream..."}
            </Text>
            <Text style={styles.loadingSubtext}>
              Connecting to DLHD channel
            </Text>
          </View>
        )}

        {error ? (
          <View style={styles.errorContainer}>
            <MaterialIcons name="error-outline" size={50} color="#ff6b6b" />
            <Text style={styles.errorText}>{error}</Text>
            {retryCount < maxRetries && (
              <TouchableOpacity
                style={styles.retryButton}
                onPress={handleRetry}
                accessibilityLabel="Retry loading"
                accessibilityRole="button"
              >
                <MaterialIcons name="refresh" size={20} color="#fff" />
                <Text style={styles.retryLabel}>Retry Stream</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.backButtonError}
              onPress={handleGoBack}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <Text style={styles.backButtonText}>Back to Channels</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <VideoView
            style={isLandscape ? styles.fullscreenVideo : styles.video}
            player={player}
            allowsFullscreen
            allowsPictureInPicture
            nativeControls={true}
            contentFit="contain"
          />
        )}
      </View>

      {/* Landscape Header Overlay */}
      {isLandscape && !error && (
        <View style={styles.landscapeHeader}>
          <SafeAreaView style={styles.landscapeHeaderSafe}>
            <View style={styles.landscapeHeaderContent}>
              <TouchableOpacity
                onPress={handleGoBack}
                style={styles.landscapeBackButton}
              >
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </TouchableOpacity>
              <View style={styles.landscapeTitleContainer}>
                <Text style={styles.landscapeTitle} numberOfLines={1}>
                  {title || "Live Channel"}
                </Text>
                {isLive && (
                  <View style={styles.landscapeLiveIndicator}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText}>LIVE</Text>
                  </View>
                )}
              </View>
              <Text style={styles.landscapeTime}>{getCurrentTime()}</Text>
            </View>
          </SafeAreaView>
        </View>
      )}

      {/* Live Stream Corner Indicator */}
      {isLive && !error && (
        <View
          style={[styles.cornerLiveIndicator, { top: isLandscape ? 20 : 60 }]}
        >
          <View style={styles.cornerLiveDot} />
          <Text style={styles.cornerLiveText}>LIVE</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  headerContainer: {
    backgroundColor: "#121212",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  titleContainer: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ff4444",
    marginRight: 6,
  },
  liveText: {
    color: "#ff4444",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  timeText: {
    color: "#aaa",
    fontSize: 12,
    marginLeft: 4,
  },
  videoContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  video: {
    width: "100%",
    height: "100%",
  },
  fullscreenVideoContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  fullscreenVideo: {
    width: "100%",
    height: "100%",
  },
  loadingContainer: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  loadingText: {
    color: "#aaa",
    marginTop: 12,
    fontSize: 16,
    fontWeight: "500",
  },
  loadingSubtext: {
    color: "#666",
    marginTop: 6,
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    color: "#ff6b6b",
    marginTop: 12,
    marginBottom: 20,
    textAlign: "center",
    fontSize: 16,
    lineHeight: 24,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF5722",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    elevation: 2,
    shadowColor: "#FF5722",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    marginBottom: 12,
  },
  retryLabel: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
    marginLeft: 8,
  },
  backButtonError: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#666",
  },
  backButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  landscapeHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  landscapeHeaderSafe: {
    paddingTop: 10,
  },
  landscapeHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  landscapeBackButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  landscapeTitleContainer: {
    flex: 1,
    marginLeft: 16,
  },
  landscapeTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  landscapeLiveIndicator: {
    flexDirection: "row",
    alignItems: "center",
  },
  landscapeTime: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  cornerLiveIndicator: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,68,68,0.9)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 3,
  },
  cornerLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#fff",
    marginRight: 4,
  },
  cornerLiveText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
