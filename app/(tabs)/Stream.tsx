import React, { useEffect, useRef, useState } from "react";
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  StatusBar,
  ScrollView,
  Platform,
  BackHandler,
  Animated
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import axios from "axios";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as ScreenOrientation from "expo-screen-orientation";
import * as Haptics from "expo-haptics";
import streamingService from "../../utils/streamingService";
import { RootStackParamList } from "../../types/navigation";
import { useFocusEffect } from "expo-router";
import { useIsFocused } from "@react-navigation/native";

const { width, height } = Dimensions.get("window");
type StreamRouteProp = RouteProp<RootStackParamList, "Stream">;

export default function StreamVideo() {
  const route = useRoute<StreamRouteProp>();
  const navigation = useNavigation();
  const videoRef = useRef<Video>(null);
  const isFocused = useIsFocused();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const {
    mediaType = "movie",
    id: movieId,
    videoTitle,
    slug,
    episodeId,
    useFallback = false,
    seasonNumber,
    episodeNumber,
    streamUrl: directStreamUrl,
    sourceName: directSourceName
  } = route.params;

  const BASE_URL = Constants.expoConfig?.extra?.API_Backend ?? "";
  const EXTRA_URL = Constants.expoConfig?.extra?.extractorUrl;

  const [availableSources, setAvailableSources] = useState<
    Array<{ id: string; name: string; url?: string; quality?: string }>
  >([]);
  const [sourceName, setSourceName] = useState<string>(directSourceName || "");
  const [streamUrl, setStreamUrl] = useState<string>(directStreamUrl || "");
  const [isLoading, setLoading] = useState<boolean>(!Boolean(directStreamUrl));
  const [error, setError] = useState<string | null>(null);
  const [isLandscape, setIsLandscape] = useState<boolean>(false);
  const [shouldPlayVideo, setShouldPlayVideo] = useState<boolean>(true);
  const [toast, setToast] = useState<string | null>(null);
  const [loadingSourceId, setLoadingSourceId] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);

  const cleanupVideo = async () => {
    if (videoRef.current) {
      try {
        await videoRef.current.pauseAsync();
        await videoRef.current.unloadAsync();
      } catch (err) {
        console.warn("Failed to cleanup video:", err);
      }
      setShouldPlayVideo(false);
    }
  };

  const showToast = (message: string) => {
    setToast(message);
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true
      }),
      Animated.delay(2500),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true
      })
    ]).start(() => setToast(null));
  };

  const getErrorMessage = (error: any) => {
    if (error?.message?.includes("Network")) return "Check your internet connection";
    if (error?.message?.includes("timeout")) return "Connection timed out";
    if (error?.code === "SOURCE_ERROR") return "Video source unavailable";
    return "Something went wrong. Please try again.";
  };

  useEffect(() => {
    if (!isFocused) {
      cleanupVideo();
    } else if (!shouldPlayVideo) {
      setShouldPlayVideo(true);
    }
  }, [isFocused]);

  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        handleGoBack();
        return true;
      };
      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => subscription.remove();
    }, [])
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", () => {
      if (videoRef.current) {
        videoRef.current.pauseAsync().catch(() => {});
        videoRef.current.unloadAsync().catch(() => {});
        setShouldPlayVideo(false);
      }
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {});
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    return () => {
      cleanupVideo();
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!streamUrl && videoRef.current) {
      videoRef.current.unloadAsync().catch(() => {});
    }
  }, [streamUrl]);

  const handleGoBack = async () => {
    await cleanupVideo();
    try {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {});
    } catch (error) {
      console.warn("Failed to lock orientation", error);
    }
    navigation.goBack();
  };

  const fetchSources = async () => {
    try {
      if (useFallback && mediaType === "tvSeries") {
        const { seasonNumber, episodeNumber } = route.params;
        if (!seasonNumber || !episodeNumber) {
          throw new Error("Season and episode numbers are required for fallback");
        }

        const streamingInfo = await streamingService.getEpisodeStreamingUrlFallback(
          movieId.toString(),
          seasonNumber,
          episodeNumber
        );

        setStreamUrl(streamingInfo.streamUrl);
        setSourceName(streamingInfo.selectedServer?.name || "Fallback Server");
        setLoading(false);
        return;
      }

      const effectiveSlug = slug || streamingService.slugify(videoTitle);
      const endpoint =
        mediaType === "movie"
          ? `${BASE_URL}/movie/watch-${effectiveSlug}-${movieId}/servers`
          : `${BASE_URL}/movie/watch-${effectiveSlug}-${movieId}/servers?episodeId=${episodeId}`;

      const resp = await axios.get<{
        servers: Array<{ id: string; name: string; quality?: string }>;
      }>(endpoint, { timeout: 15000 });

      const servers = resp.data.servers.map(server => ({
        ...server,
        quality: server.name.toLowerCase().includes("hd")
          ? "HD"
          : server.name.toLowerCase().includes("4k")
            ? "4K"
            : undefined
      }));

      setAvailableSources(servers);

      const vid = servers.find(s => s.name.toLowerCase() === "vidcloud");
      if (vid) {
        await changeSource(vid.id, vid.name);
      } else if (servers.length > 0) {
        await changeSource(servers[0].id, servers[0].name);
      } else {
        setLoading(false);
      }
      setRetryCount(0);
    } catch (e: any) {
      console.warn("Failed to fetch sources", e);
      setError(getErrorMessage(e));
      setLoading(false);
    }
  };

  const changeSource = async (serverId: string, name: string) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    setLoadingSourceId(serverId);
    setLoading(true);
    setError(null);
    showToast(`Switching to ${name}...`);

    try {
      const effectiveSlug = slug || streamingService.slugify(videoTitle);
      const params = mediaType === "movie" ? { serverId } : { serverId, episodeId };

      const resp = await axios.get<{ sources: Array<{ src: string }> }>(
        `${BASE_URL}/movie/${effectiveSlug}-${movieId}/sources`,
        { params, timeout: 30000 }
      );

      const src = resp.data.sources?.[0]?.src;
      if (!src) throw new Error("No source URL returned");

      setStreamUrl(src);
      setSourceName(name);
      showToast(`Now playing from ${name}`);
    } catch (e: any) {
      console.error("Failed to change source", e);
      const errorMsg = getErrorMessage(e);
      setError(errorMsg);
      showToast(`Failed to load ${name}`);

      if (retryCount < 2) {
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
          changeSource(serverId, name);
        }, 2000);
      }
    } finally {
      setLoading(false);
      setLoadingSourceId(null);
    }
  };

  const handleVideoError = (e: any) => {
    console.error("Video error:", e);
    const errorMsg = "Playback failed. Try switching servers.";
    setError(errorMsg);
    showToast(errorMsg);
  };

  const autoRetry = async () => {
    if (availableSources.length > 0) {
      const currentIndex = availableSources.findIndex(s => s.name === sourceName);
      const nextSource = availableSources[currentIndex + 1] || availableSources[0];
      await changeSource(nextSource.id, nextSource.name);
    } else {
      fetchSources();
    }
  };

  useEffect(() => {
    if (!directStreamUrl) {
      fetchSources();
    } else {
      setLoading(false);
    }
  }, [movieId, episodeId]);

  useEffect(() => {
    ScreenOrientation.unlockAsync();
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
    };
  }, []);

  useEffect(() => {
    const sub = ScreenOrientation.addOrientationChangeListener(evt => {
      const o = evt.orientationInfo.orientation;
      const land =
        o === ScreenOrientation.Orientation.LANDSCAPE_LEFT || o === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
      setIsLandscape(land);
      StatusBar.setHidden(land);
    });
    return () => ScreenOrientation.removeOrientationChangeListener(sub);
  }, []);

  const renderSourceSkeleton = () => (
    <View style={styles.sourcesSkeleton}>
      {[1, 2, 3].map(i => (
        <View key={i} style={styles.skeletonSource} />
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleGoBack}
          style={styles.back}
          accessibilityLabel="Go back"
          accessibilityRole="button">
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {videoTitle}
        </Text>
      </View>

      {!directStreamUrl && (
        <View style={styles.sourceBar}>
          <Text style={styles.sourceText}>{sourceName ? `Source: ${sourceName}` : "Loading sources..."}</Text>
          {isLoading && !streamUrl ? (
            renderSourceSkeleton()
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {availableSources.map(s => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => changeSource(s.id, s.name)}
                  style={[
                    styles.sourceButton,
                    s.name === sourceName && styles.activeSource,
                    loadingSourceId === s.id && styles.loadingSource
                  ]}
                  disabled={isLoading || s.name === sourceName}
                  accessibilityLabel={`Select ${s.name} server${s.quality ? ` (${s.quality})` : ""}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: s.name === sourceName }}>
                  <Text style={[styles.sourceLabel, s.name === sourceName && styles.activeSourceLabel]}>{s.name}</Text>
                  {s.quality && <Text style={styles.qualityLabel}>{s.quality}</Text>}
                  {loadingSourceId === s.id && (
                    <ActivityIndicator size="small" color="#fff" style={styles.sourceLoader} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {isLoading && !streamUrl ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#FF5722" />
          <Text style={styles.loadingText}>Loading video...</Text>
        </View>
      ) : error ? (
        <View style={styles.error}>
          <MaterialIcons name="error-outline" size={50} color="#ff6b6b" />
          <Text style={styles.errorText}>{error}</Text>
          <View style={styles.errorActions}>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => (directStreamUrl ? setError(null) : fetchSources())}
              accessibilityLabel="Retry loading"
              accessibilityRole="button">
              <Text style={styles.retryLabel}>Retry</Text>
            </TouchableOpacity>
            {availableSources.length > 0 && (
              <TouchableOpacity
                style={[styles.retryButton, styles.autoRetryButton]}
                onPress={autoRetry}
                accessibilityLabel="Try different server"
                accessibilityRole="button">
                <Text style={styles.retryLabel}>Try Different Server</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
        <View style={isLandscape ? styles.fullscreenVideoContainer : styles.videoBox}>
          {shouldPlayVideo && (
            <Video
              ref={videoRef}
              source={{ uri: streamUrl }}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              style={isLandscape ? styles.fullscreenVideo : styles.video}
              onError={handleVideoError}
              onLoad={() => {
                console.log("Video loaded");
                showToast("Video loaded successfully");
              }}
              shouldPlay={true}
            />
          )}
        </View>
      )}

      {availableSources.some(s => s.name === "Vidfast") && sourceName !== "Vidfast" && (
        <TouchableOpacity
          style={styles.switchToVidfastButton}
          onPress={() => {
            const vidfastSource = availableSources.find(s => s.name === "Vidfast");
            if (vidfastSource) {
              changeSource(vidfastSource.id, vidfastSource.name);
            }
          }}
          accessibilityLabel="Switch to Vidfast server"
          accessibilityRole="button">
          <MaterialIcons name="speed" size={16} color="#000" style={styles.vidfastIcon} />
          <Text style={styles.switchToVidfastText}>Switch to Vidfast</Text>
        </TouchableOpacity>
      )}

      {toast && (
        <Animated.View style={[styles.toast, { opacity: fadeAnim }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center"
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#121212",
    borderBottomWidth: 1,
    borderBottomColor: "#333"
  },
  back: {
    padding: 8,
    borderRadius: 20
  },
  title: {
    flex: 1,
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 8
  },
  sourceBar: {
    backgroundColor: "#121212",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#333"
  },
  sourceText: {
    color: "#aaa",
    marginBottom: 8,
    fontSize: 14
  },
  sourcesSkeleton: {
    flexDirection: "row",
    paddingVertical: 4
  },
  skeletonSource: {
    width: 80,
    height: 32,
    backgroundColor: "#2c2c2c",
    borderRadius: 20,
    marginRight: 8,
    opacity: 0.6
  },
  sourceButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 8,
    backgroundColor: "#2c2c2c",
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
    minHeight: 36
  },
  sourceLabel: {
    color: "#ddd",
    fontSize: 12,
    fontWeight: "500"
  },
  qualityLabel: {
    fontSize: 10,
    color: "#aaa",
    marginLeft: 6,
    backgroundColor: "#444",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4
  },
  sourceLoader: {
    marginLeft: 6
  },
  activeSource: {
    backgroundColor: "#FF5722",
    borderColor: "#FF7043",
    elevation: 2,
    shadowColor: "#FF5722",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4
  },
  activeSourceLabel: {
    color: "#fff",
    fontWeight: "bold"
  },
  loadingSource: {
    backgroundColor: "#FF5722",
    opacity: 0.7
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  loadingText: {
    color: "#aaa",
    marginTop: 12,
    fontSize: 14
  },
  error: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20
  },
  errorText: {
    color: "#ff6b6b",
    marginTop: 12,
    textAlign: "center",
    fontSize: 16,
    lineHeight: 24
  },
  errorActions: {
    flexDirection: "row",
    marginTop: 20,
    gap: 12
  },
  retryButton: {
    backgroundColor: "#FF5722",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    elevation: 2
  },
  autoRetryButton: {
    backgroundColor: "#4CAF50"
  },
  retryLabel: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14
  },
  videoBox: {
    width,
    height: (width * 9) / 16,
    backgroundColor: "#000",
    alignSelf: "center"
  },
  video: { width: "100%", height: "100%" },
  fullscreenVideoContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000"
  },
  fullscreenVideo: {
    width: height,
    height: width
  },
  switchToVidfastButton: {
    marginTop: 12,
    backgroundColor: "#FFD700",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    elevation: 2
  },
  vidfastIcon: {
    marginRight: 6
  },
  switchToVidfastText: {
    color: "#000",
    fontWeight: "bold",
    fontSize: 14
  },
  toast: {
    position: "absolute",
    bottom: 100,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.9)",
    padding: 12,
    borderRadius: 8,
    zIndex: 1000,
    maxWidth: width - 40
  },
  toastText: {
    color: "#fff",
    textAlign: "center",
    fontSize: 14
  }
});
