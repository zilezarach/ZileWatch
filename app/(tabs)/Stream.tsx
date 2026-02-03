import React, { useEffect, useRef, useState } from "react";
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  StatusBar,
  Animated,
  ScrollView
} from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import * as ScreenOrientation from "expo-screen-orientation";
import { RootStackParamList } from "../../types/navigation";
import { SafeAreaView } from "react-native-safe-area-context";
import streamingService, { FlixerSource } from "../../utils/streamingService";

const { width } = Dimensions.get("window");

type StreamRouteProp = RouteProp<RootStackParamList, "Stream">;

export default function StreamVideo() {
  const route = useRoute<StreamRouteProp>();
  const navigation = useNavigation();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const {
    mediaType = "movie",
    id: movieId,
    videoTitle,
    slug,
    episodeId,
    useFallback = false,
    streamUrl: directStreamUrl,
    seasonNumber,
    episodeNumber
  } = route.params;

  // State
  const [availableSources, setAvailableSources] = useState<FlixerSource[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<string>("");
  const [streamUrl, setStreamUrl] = useState<string>(directStreamUrl || "");
  const [isLoading, setLoading] = useState<boolean>(!Boolean(directStreamUrl));
  const [error, setError] = useState<string | null>(null);
  const [isLandscape, setIsLandscape] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loadingSourceId, setLoadingSourceId] = useState<string | null>(null);
  const [showSourceSelector, setShowSourceSelector] = useState<boolean>(false);

  // Initialize expo-video player
  const player = useVideoPlayer(streamUrl, p => {
    p.loop = false;
    p.bufferOptions = {
      waitsToMinimizeStalling: true,
      preferredForwardBufferDuration: 30
    };
  });

  // Toast helper
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

  // Fetch Flixer sources when using TMDB source
  useEffect(() => {
    const fetchFlixerSources = async () => {
      if (!useFallback) return; // Only fetch for TMDB fallback

      try {
        setLoading(true);
        console.log("[SOURCES] Fetching Flixer sources...");

        const sources = await streamingService.getFlixerSources(String(movieId), seasonNumber, episodeNumber);

        console.log("[SOURCES] Found sources:", sources.length);
        setAvailableSources(sources);

        // Set initial active source
        if (sources.length > 0) {
          const initialSource = sources[0];
          setActiveSourceId(initialSource.server);

          // If no direct stream URL was provided, use first source
          if (!directStreamUrl && initialSource.url) {
            setStreamUrl(initialSource.url);
            showToast(`Playing from ${initialSource.server}`);
          }
        }
      } catch (err: any) {
        console.error("[SOURCES] Error fetching sources:", err.message);
        setError("Failed to load available sources");
      } finally {
        setLoading(false);
      }
    };

    fetchFlixerSources();
  }, [movieId, useFallback, seasonNumber, episodeNumber]);

  // Handle stream changes
  useEffect(() => {
    if (streamUrl && player) {
      console.log("[PLAYER] Updating stream:", streamUrl.substring(0, 80));
      player.replace({
        uri: streamUrl,
        metadata: { title: videoTitle }
      });
      player.play();
    }
  }, [streamUrl]);

  // Orientation and Status Bar
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

  // Switch to different Flixer source
  const handleSourceSwitch = async (source: FlixerSource) => {
    if (source.server === activeSourceId) {
      showToast("Already playing from this source");
      return;
    }

    try {
      setLoadingSourceId(source.server);
      showToast(`Switching to ${source.server}...`);

      console.log("[SWITCH] Changing source to:", source.server);
      console.log("[SWITCH] New URL:", source.url);

      // Pause current playback
      player.pause();

      // Update stream URL
      setStreamUrl(source.url);
      setActiveSourceId(source.server);

      showToast(`Now playing from ${source.server}`);
    } catch (err: any) {
      console.error("[SWITCH] Error:", err.message);
      showToast(`Failed to switch to ${source.server}`);
    } finally {
      setLoadingSourceId(null);
    }
  };

  // Get server display name
  const getServerDisplayName = (serverName: string): string => {
    const mapping: Record<string, string> = {
      alpha: "Alpha",
      bravo: "Bravo",
      charlie: "Charlie",
      delta: "Delta",
      foxtrot: "Foxtrot"
    };
    return mapping[serverName.toLowerCase()] || serverName;
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.container}>
        {/* Header */}
        {!isLandscape && (
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
              <Ionicons name="chevron-back" size={26} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.title} numberOfLines={1}>
              {videoTitle}
            </Text>
            {/* Source selector toggle */}
            {availableSources.length > 0 && (
              <TouchableOpacity onPress={() => setShowSourceSelector(!showSourceSelector)} style={styles.sourceToggle}>
                <MaterialIcons name="settings-input-antenna" size={24} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* VIDEO */}
        <View style={isLandscape ? styles.videoFullscreen : styles.videoWrapper}>
          {isLoading ? (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color="#FF5722" />
              <Text style={styles.loadingText}>Loading stream...</Text>
            </View>
          ) : streamUrl ? (
            <VideoView
              player={player}
              style={styles.video}
              allowsFullscreen
              allowsPictureInPicture
              contentFit="contain"
            />
          ) : (
            <View style={styles.loader}>
              <Text style={styles.errorText}>No stream available</Text>
            </View>
          )}
        </View>

        {/* SOURCE SELECTOR */}
        {!isLandscape && showSourceSelector && availableSources.length > 0 && (
          <View style={styles.sourceContainer}>
            <Text style={styles.sourceHeader}>Available Sources ({availableSources.length})</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sourceScrollContainer}>
              {availableSources.map((source, index) => {
                const isActive = source.server === activeSourceId;
                const isLoadingThis = loadingSourceId === source.server;

                return (
                  <TouchableOpacity
                    key={`${source.server}-${index}`}
                    style={[styles.sourceButton, isActive && styles.activeSource]}
                    onPress={() => handleSourceSwitch(source)}
                    disabled={isLoadingThis}>
                    {isLoadingThis ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <MaterialIcons
                          name={isActive ? "radio-button-checked" : "radio-button-unchecked"}
                          size={18}
                          color="#fff"
                        />
                        <Text style={[styles.sourceLabel, isActive && styles.activeSourceText]}>
                          {getServerDisplayName(source.server)}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Source info */}
            <View style={styles.sourceInfo}>
              <MaterialIcons name="info-outline" size={14} color="#888" />
              <Text style={styles.sourceInfoText}>Tap to switch between available sources</Text>
            </View>
          </View>
        )}

        {/* TOAST */}
        {toast && (
          <Animated.View style={[styles.toast, { opacity: fadeAnim }]}>
            <Text style={styles.toastText}>{toast}</Text>
          </Animated.View>
        )}

        {/* ERROR */}
        {error && !isLandscape && (
          <View style={styles.errorContainer}>
            <MaterialIcons name="error-outline" size={24} color="#FF5722" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#000"
  },
  container: {
    flex: 1,
    backgroundColor: "#000"
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#111"
  },
  back: {
    padding: 6,
    marginRight: 8
  },
  title: {
    flex: 1,
    color: "#fff",
    fontSize: 17,
    fontWeight: "600"
  },
  sourceToggle: {
    padding: 8,
    marginLeft: 8
  },
  /* VIDEO */
  videoWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000"
  },
  videoFullscreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    zIndex: 50
  },
  video: {
    width: "100%",
    height: "100%"
  },
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  loadingText: {
    color: "#fff",
    fontSize: 14,
    marginTop: 12
  },
  /* SOURCES */
  sourceContainer: {
    padding: 14,
    backgroundColor: "#0a0a0a",
    borderTopWidth: 1,
    borderTopColor: "#222"
  },
  sourceHeader: {
    color: "#aaa",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 10,
    textTransform: "uppercase"
  },
  sourceScrollContainer: {
    paddingRight: 14
  },
  sourceButton: {
    minWidth: 100,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: "#1f1f1f",
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#333"
  },
  activeSource: {
    backgroundColor: "#FF5722",
    borderColor: "#FF7043"
  },
  sourceLabel: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500"
  },
  activeSourceText: {
    fontWeight: "700"
  },
  sourceInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 4
  },
  sourceInfoText: {
    color: "#888",
    fontSize: 12
  },
  /* TOAST */
  toast: {
    position: "absolute",
    bottom: 40,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.9)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    zIndex: 100
  },
  toastText: {
    color: "#fff",
    fontSize: 14
  },
  /* ERROR */
  errorContainer: {
    padding: 16,
    backgroundColor: "#1a1a1a",
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  errorText: {
    color: "#FF5722",
    fontSize: 14
  }
});
