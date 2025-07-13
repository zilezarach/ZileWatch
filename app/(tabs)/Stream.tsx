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
  BackHandler
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import axios from "axios";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as ScreenOrientation from "expo-screen-orientation";
import streamingService from "@/utils/streamingService";
import { RootStackParamList } from "@/types/navigation";
import { useFocusEffect } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
const { width, height } = Dimensions.get("window");
type StreamRouteProp = RouteProp<RootStackParamList, "Stream">;

export default function StreamVideo() {
  const route = useRoute<StreamRouteProp>();
  const navigation = useNavigation();
  const videoRef = useRef<Video>(null);
  const isFocused = useIsFocused();
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

  // State
  const [availableSources, setAvailableSources] = useState<Array<{ id: string; name: string; url?: string }>>([]);
  const [sourceName, setSourceName] = useState<string>(directSourceName || "");
  const [streamUrl, setStreamUrl] = useState<string>(directStreamUrl || "");
  const [isLoading, setLoading] = useState<boolean>(!Boolean(directStreamUrl));
  const [error, setError] = useState<string | null>(null);
  const [isLandscape, setIsLandscape] = useState<boolean>(false);
  const [shouldPlayVideo, setShouldPlayVideo] = useState<boolean>(true);
  //handle clean up
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
  //handle the user

  useEffect(() => {
    if (!isFocused) {
      cleanupVideo();
    } else if (!shouldPlayVideo) {
      setShouldPlayVideo(true);
    }
  }, [isFocused]);
  //handle harder backbutton
  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        handleGoBack();
        return true;
      };
      BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => {
        BackHandler.removeEventListener("hardwareBackPress", onBackPress);
      };
    }, [])
  );
  // Navigation listeners
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", e => {
      // Make sure video stops playing when navigating away
      if (videoRef.current) {
        videoRef.current.pauseAsync().catch(() => {});
        videoRef.current.unloadAsync().catch(() => {});
        setShouldPlayVideo(false);
      }

      // Restore orientation to portrait when leaving
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {});
    });

    return unsubscribe;
  }, [navigation]);
  // Clean up when component unmounts
  useEffect(() => {
    return () => {
      cleanupVideo();
      // Always ensure we return to portrait on unmount
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {});
    };
  }, []);

  //Reset video
  useEffect(() => {
    if (!streamUrl && videoRef.current) {
      videoRef.current.unloadAsync().catch(() => {});
    }
  }, [streamUrl]);

  //handle back buttton press
  const handleGoBack = async () => {
    await cleanupVideo();
    try {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {});
    } catch (error) {
      console.warn("Failed to lock orientation", error);
    }
    navigation.goBack();
  };
  // Fetch available servers
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

      //  existing logic for primary API
      const effectiveSlug = slug || streamingService.slugify(videoTitle);
      const endpoint =
        mediaType === "movie"
          ? `${BASE_URL}/movie/watch-${effectiveSlug}-${movieId}/servers`
          : `${BASE_URL}/movie/watch-${effectiveSlug}-${movieId}/servers?episodeId=${episodeId}`;

      const resp = await axios.get<{
        servers: Array<{ id: string; name: string }>;
      }>(endpoint, { timeout: 10000 });

      const servers = resp.data.servers;
      setAvailableSources(servers);

      // auto‑select Vidcloud
      const vid = servers.find(s => s.name.toLowerCase() === "vidcloud");
      if (vid) {
        await changeSource(vid.id, vid.name);
      } else {
        setLoading(false);
      }
    } catch (e: any) {
      console.warn("Failed to fetch sources", e);
      setError("Failed to load streaming sources.");
      setLoading(false);
    }
  };
  // Change source
  const changeSource = async (serverId: string, name: string) => {
    setLoading(true);
    setError(null);
    try {
      const effectiveSlug = slug || streamingService.slugify(videoTitle);
      const params = mediaType === "movie" ? { serverId } : { serverId, episodeId };

      const resp = await axios.get<{ sources: Array<{ src: string }> }>(
        `${BASE_URL}/movie/${effectiveSlug}-${movieId}/sources`,
        { params, timeout: 10000 }
      );

      const src = resp.data.sources?.[0]?.src;
      if (!src) throw new Error("No source URL returned");

      setStreamUrl(src);
      setSourceName(name);
    } catch (e: any) {
      console.error("Failed to change source", e);
      setError("Could not load selected source.");
    } finally {
      setLoading(false);
    }
  };

  // Initial setup
  useEffect(() => {
    if (!directStreamUrl) {
      fetchSources();
    } else {
      setLoading(false);
    }
  }, [movieId, episodeId]);

  // Orientation
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

  // Render
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {videoTitle}
        </Text>
      </View>

      {/* Source selector */}
      {!directStreamUrl && (
        <View style={styles.sourceBar}>
          <Text style={styles.sourceText}>{sourceName ? `Source: ${sourceName}` : "Loading sources..."}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {availableSources.map(s => (
              <TouchableOpacity
                key={s.id}
                onPress={() => changeSource(s.id, s.name)}
                style={[styles.sourceButton, s.name === sourceName && styles.activeSource]}
                disabled={isLoading || s.name === sourceName}>
                <Text style={[styles.sourceLabel, s.name === sourceName && styles.activeSourceLabel]}>{s.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Content */}
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#FF5722" />
        </View>
      ) : error ? (
        <View style={styles.error}>
          <MaterialIcons name="error-outline" size={50} color="#ff6b6b" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => (directStreamUrl ? setError(null) : fetchSources())}>
            <Text style={styles.retryLabel}>Retry</Text>
          </TouchableOpacity>
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
              onError={(e: any) => {
                console.error("Video error:", e);
                setError("Playback failed");
              }}
              onLoad={() => console.log("Video loaded")}
            />
          )}
        </View>
      )}
      {availableSources.some(s => s.name === "Vidfast") && (
        <TouchableOpacity
          style={styles.switchToVidfastButton}
          onPress={() => {
            const vidfastSource = availableSources.find(s => s.name === "Vidfast");
            if (vidfastSource) {
              changeSource(vidfastSource.id, vidfastSource.name);
            }
          }}>
          <Text style={styles.switchToVidfastText}>Switch to Vidfast</Text>
        </TouchableOpacity>
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
    backgroundColor: "#121212"
  },
  back: { padding: 8 },
  title: {
    flex: 1,
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 8
  },
  switchToVidfastButton: {
    marginTop: 8,
    backgroundColor: "#FFD700", // Gold color for visibility
    padding: 10,
    borderRadius: 5,
    alignItems: "center"
  },
  switchToVidfastText: {
    color: "#000",
    fontWeight: "bold"
  },
  sourceBar: {
    backgroundColor: "#121212",
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#333"
  },
  sourceText: { color: "#aaa", marginBottom: 4 },
  sourceButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 8,
    backgroundColor: "#2c2c2c",
    borderRadius: 16
  },
  sourceLabel: { color: "#ddd", fontSize: 12 },
  activeSource: { backgroundColor: "#FF5722" },
  activeSourceLabel: { color: "#fff", fontWeight: "bold" },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  error: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { color: "#ff6b6b", marginTop: 12, textAlign: "center" },
  retryButton: {
    marginTop: 16,
    backgroundColor: "#FF5722",
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8
  },
  retryLabel: { color: "#fff", fontWeight: "bold" },
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
  }
});
