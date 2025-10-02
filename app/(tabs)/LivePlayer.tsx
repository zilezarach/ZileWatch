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
} from "react-native";
import { ResizeMode, Video } from "expo-av";
import { AppState } from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import * as ScreenOrientation from "expo-screen-orientation";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";

const { width, height } = Dimensions.get("window");

export default function PlayerScreen() {
  const { url, title } = useLocalSearchParams();
  const navigation = useNavigation();
  const videoRef = useRef<Video>(null);
  const [loading, setLoading] = useState(true);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isLive, setIsLive] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      e.preventDefault();
      const cleanupAndExit = async () => {
        if (videoRef.current) {
          try {
            // Force stop playback and unload
            await videoRef.current.stopAsync();
            await videoRef.current.unloadAsync();
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
      };

      cleanupAndExit();
    });

    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state.match(/inactive|background/) && videoRef.current) {
        try {
          await videoRef.current.pauseAsync();
        } catch (err) {
          console.warn("Failed to pause on background:", err);
        }
      }
    });

    return () => sub.remove();
  }, []);

  const handleGoBack = async () => {
    if (videoRef.current) {
      try {
        await videoRef.current.pauseAsync();
        await videoRef.current.unloadAsync();
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

  const handleVideoError = (e: any) => {
    console.error("Video error:", e);
    setError("Playback failed. Please try again.");
    setLoading(false);
  };

  const handleRetry = async () => {
    setError(null);
    setLoading(true);
    if (videoRef.current) {
      try {
        await videoRef.current.unloadAsync();
        await videoRef.current.loadAsync(
          {
            uri: String(url),
          },
          { shouldPlay: true },
          false,
        );
      } catch (err) {
        console.error("Unable to catch stream", err);
        setError("Failed to fetch stream try again");
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
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF5722" />
            <Text style={styles.loadingText}>Loading stream...</Text>
          </View>
        )}

        {error ? (
          <View style={styles.errorContainer}>
            <MaterialIcons name="error-outline" size={50} color="#ff6b6b" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleRetry}
              accessibilityLabel="Retry loading"
              accessibilityRole="button"
            >
              <Text style={styles.retryLabel}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Video
            ref={videoRef}
            source={{ uri: String(url) }}
            style={isLandscape ? styles.fullscreenVideo : styles.video}
            resizeMode={ResizeMode.CONTAIN}
            useNativeControls={true}
            shouldPlay
            onLoadStart={() => setLoading(true)}
            onLoad={() => {
              setLoading(false);
              console.log("Video loaded successfully");
            }}
            onError={handleVideoError}
          />
        )}
      </View>

      {/* Landscape Header Overlay */}
      {isLandscape && (
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
      {isLive && (
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

  // Header Styles
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

  // Video Styles
  videoContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  video: {
    width: "100%",
    aspectRatio: 16 / 9,
  },
  fullscreenVideoContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  fullscreenVideo: {
    width: "100%",
    height: "100%",
  },

  // Loading Styles
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

  // Error Styles
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
    backgroundColor: "#FF5722",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    elevation: 2,
    shadowColor: "#FF5722",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  retryLabel: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },

  // Landscape Header Overlay
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

  // Corner Live Indicator
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
