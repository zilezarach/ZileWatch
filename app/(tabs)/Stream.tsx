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
  ScrollView
} from "react-native";
import Video, { VideoRef } from "react-native-video";
import axios from "axios";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { RootStackParamList } from "@/types/navigation";
import Constants from "expo-constants";
import * as ScreenOrientation from "expo-screen-orientation";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import streamingService, { SearchItem } from "@/utils/streamingService";
const { slugify } = streamingService;
const { width, height } = Dimensions.get("window");

type StreamRouteProp = RouteProp<RootStackParamList, "Stream">;

interface StreamSource {
  id: string;
  name: string;
}
interface SourcesResponse {
  sources: Array<{
    src: string;
    type: string;
  }>;
  tracks?: Array<{
    file: string;
    label: string;
    kind: string;
    default?: boolean;
  }>;
}
interface StreamVideoProps {
  mediaType: "movie" | "tvSeries";
  id: string;
  videoTitle: string;
  episodeId?: string; // Make optional
  streamUrl?: string;
  sourceName?: string;
  subtitles?: Array<{
    file: string;
    label: string;
    kind: string;
    default?: boolean;
  }>;
}
const StreamVideo = () => {
  const route = useRoute<StreamRouteProp>();
  const navigation = useNavigation();
  const videoRef = useRef<VideoRef>(null);

  const {
    mediaType = "movie",
    id,
    videoTitle,
    episodeId: episodeId,
    streamUrl: directStreamUrl,
    sourceName: directSourceName
  } = route.params;

  const [availableSources, setAvailableSources] = useState<StreamSource[]>([]);
  const [sourceName, setSourceName] = useState<string>(directSourceName || "");
  const [streamUrl, setStreamUrl] = useState<string>("");
  const [streamType, setStreamType] = useState<string>("m3u8");
  const [headers, setHeaders] = useState<Record<string, string>>({
    "User-Agent": "ExoPlayerDemo/1.0 (Linux;Android 11) ExoPlayerLib/2.14.0"
  });
  //const [subtitles, setSubtitles] = useState<any[]>(directSubtitles || []);
  const [isLoading, setLoading] = useState<boolean>(!directStreamUrl);
  const [isPlaying, setPlaying] = useState<boolean>(true);
  const [isLandscape, setIsLandscape] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);
  const BASE_URL = Constants.expoConfig?.extra?.API_Backend;
  // Map API type/url → container hint
  const determineStreamType = (url: string, apiType?: string): string => {
    if (apiType) return apiType.toLowerCase();
    const ext = url.split(".").pop()?.split(/[?#]/)[0] || "";
    return ext === "m3u8" ? "hls" : ext;
  };
  // Fetch servers list
  const fetchSources = async () => {
    try {
      // Don't include episodeId for movies
      const endpoint =
        mediaType === "movie"
          ? `${Constants.expoConfig?.extra?.API_Backend}/movie/${id}/servers`
          : `${Constants.expoConfig?.extra?.API_Backend}/movie/${id}/servers?episodeId=${episodeId}`;

      const resp = await axios.get(endpoint, { timeout: 10000 });
      const servers: StreamSource[] = resp.data.servers || [];
      setAvailableSources(servers);

      // Auto‑select Vidcloud if present
      const vid = servers.find(s => s.name.toLowerCase() === "vidcloud");
      if (vid) {
        changeSource(vid.id, vid.name);
      }
    } catch (e) {
      console.warn("Failed to fetch sources", e);
      setError("Failed to load streaming sources. Please try again.");
    }
  };
  // Setup or re‑setup the stream
  const setupStream = async () => {
    if (directStreamUrl) {
      setStreamType(determineStreamType(directStreamUrl));
      setLoading(false);
      fetchSources();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Get servers first (so we can default to Vidcloud)
      await fetchSources();

      // If Vidcloud was auto‑selected, its changeSource call will handle the rest
      if (sourceName.toLowerCase() === "vidcloud") {
        return;
      }

      // Otherwise, pick the first available
      if (availableSources.length > 0) {
        const first = availableSources[0];
        await changeSource(first.id, first.name);
      } else {
        throw new Error("No streaming servers available");
      }
    } catch (e: any) {
      console.error("Stream setup failed", e);
      setError(e.message || "Failed to load stream");
    } finally {
      setLoading(false);
    }
  };

  // Change to a new source by ID

  const changeSource = async (newSourceId: string, newSourceName?: string) => {
    setLoading(true);
    setError(null);
    setPlaying(false);

    try {
      // Build params based on media type
      const params = mediaType === "movie" ? { serverId: newSourceId } : { serverId: newSourceId, episodeId };

      const resp = await axios.get<SourcesResponse>(`${BASE_URL}/movie/${id}/sources`, { params, timeout: 10000 });
      const info = resp.data.sources?.[0];
      const source = resp.data.sources?.[0];
      if (!source?.src) throw new Error("No source URL returned");
      setStreamUrl(source.src);
      setStreamType(determineStreamType(source.src, source.type));
      setSourceName(newSourceName || resp.data.serverName || "");

      // Add Referer header if needed
      const origin = new URL(streamUrl).origin;
      setHeaders(h => ({ ...h, Referer: origin }));

      setPlaying(true);
    } catch (e: any) {
      console.error("Failed to change source", e);
      setError(e.message || "Could not load selected source");
    } finally {
      setLoading(false);
    }
  };

  // Retry logic
  const retryStream = () => {
    if (retryCount < 2) {
      setRetryCount(c => c + 1);
      setupStream();
    } else {
      setError("Unable to play video after multiple attempts.");
    }
  };

  // Orientation and lifecycle effects
  useEffect(() => {
    setupStream();

    ScreenOrientation.unlockAsync();
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
    };
  }, [id, episodeId]);

  useEffect(() => {
    const sub = ScreenOrientation.addOrientationChangeListener(evt => {
      const o = evt.orientationInfo.orientation;
      const isLand =
        o === ScreenOrientation.Orientation.LANDSCAPE_LEFT || o === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
      setIsLandscape(isLand);
      if (Platform.OS === "ios" && videoRef.current) {
        isLand ? videoRef.current.presentFullscreenPlayer() : videoRef.current.dismissFullscreenPlayer();
      }
    });
    return () => ScreenOrientation.removeOrientationChangeListener(sub);
  }, []);

  useEffect(() => {
    StatusBar.setHidden(isLandscape);
  }, [isLandscape]);

  const handleError = (err: any) => {
    console.error("Video Error", err);
    setError("Playback error, retrying...");
    retryStream();
  };

  const videoStyle = Platform.OS === "android" && isLandscape ? [styles.video, styles.fullscreenVideo] : styles.video;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.titleText} numberOfLines={1}>
          {videoTitle}
        </Text>
      </View>

      {/* Server selector */}
      <View style={styles.sourceInfo}>
        <Text style={styles.sourceText}>{sourceName ? `Source: ${sourceName}` : "Loading sources..."}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sourceScrollView}>
          {availableSources.map(s => {
            const isActive = s.name === sourceName;
            const isVid = s.name.toLowerCase() === "vidcloud";
            return (
              <TouchableOpacity
                key={s.id}
                style={[styles.sourceButton, isVid && styles.recommendedButton, isActive && styles.activeSourceButton]}
                onPress={() => changeSource(s.id, s.name)}
                disabled={isLoading || isActive}>
                <Text style={[styles.sourceButtonText, isActive && styles.activeSourceButtonText]}>
                  {s.name}
                  {isVid ? " (Recommended)" : ""}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Loading / Error / Video */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF5722" />
          <Text style={styles.loadingText}>Loading stream…</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={50} color="#ff6b6b" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={retryStream}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.videoContainer}>
          <Video
            ref={videoRef}
            source={{
              uri: `${BASE_URL}proxy?url=${encodeURIComponent(streamUrl)}`,
              type: streamType,
              headers: {
                "User-Agent": "ExoPlayerDemo/1.0 (Linux;Android 11) ExoPlayerLib/2.14.0",
                Referer: "https://flixhq.to"
              }
            }}
            style={videoStyle}
            controls
            paused={!isPlaying}
            resizeMode="contain"
            onBuffer={({ isBuffering }) => setIsBuffering(isBuffering)}
            onError={handleError}
            onLoad={() => setIsBuffering(false)}
            onProgress={() => {}}
            fullscreen={isLandscape}
            minLoadRetryCount={5}
            bufferConfig={{
              minBufferMs: 15000,
              maxBufferMs: 60000,
              bufferForPlaybackMs: 2500,
              bufferForPlaybackAfterRebufferMs: 5000
            }}
          />
          {isBuffering && (
            <View style={styles.bufferOverlay}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.bufferText}>Buffering…</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#121212"
  },
  headerButton: { padding: 8 },
  titleText: {
    flex: 1,
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
    marginLeft: 8
  },
  sourceInfo: {
    backgroundColor: "#121212",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#333"
  },
  sourceText: { color: "#aaa", fontSize: 14 },
  sourceScrollView: { marginTop: 8 },
  sourceButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: "#2c2c2c"
  },
  recommendedButton: {
    borderWidth: 1,
    borderColor: "#FF5722"
  },
  activeSourceButton: { backgroundColor: "#FF5722" },
  sourceButtonText: { color: "#ddd", fontSize: 12 },
  activeSourceButtonText: { color: "#fff", fontWeight: "bold" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, color: "#fff" },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20
  },
  errorText: {
    color: "#ff6b6b",
    fontSize: 16,
    textAlign: "center",
    marginVertical: 16
  },
  retryButton: {
    backgroundColor: "#FF5722",
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8
  },
  retryButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  videoContainer: { flex: 1, backgroundColor: "#000" },
  video: { flex: 1 },
  fullscreenVideo: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width,
    height
  },
  bufferOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center"
  },
  bufferText: { color: "#fff", marginTop: 8 }
});

export default StreamVideo;
