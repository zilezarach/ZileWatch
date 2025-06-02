import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  StyleSheet,
  Image,
  Modal,
} from "react-native";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { RootStackParamList } from "@/types/navigation";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import streamingService from "@/utils/streamingService";
import axios from "axios";
import Constants from "expo-constants";
import { Episode } from "@/types/models";

type EpisodeListRouteProp = RouteProp<RootStackParamList, "EpisodeList">;

interface EpisodeItem {
  id: string;
  number: number;
  name: string;
  title: string;
  description?: string;
  img?: string;
}

export default function EpisodeListScreen() {
  const route = useRoute<EpisodeListRouteProp>();
  const {
    tv_id,
    seasonName,
    season_number,
    seriesTitle,
    slug,
    seasonId,
    seasonNumberForApi,
    useFallback,
  } = route.params;

  const [episodes, setEpisodes] = useState<EpisodeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sources, setSources] = useState<any[]>([]);
  const [selectedSource, setSelectedSource] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [currentEpisode, setCurrentEpisode] = useState<EpisodeItem | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const cacheKey = `backend_episodes_${tv_id}_season_${tv_id}`;

  // Fetch episodes from your backend
  const fetchEpisodes = useCallback(async () => {
    try {
      setError(null);

      const cacheKey = `backend_episodes_${tv_id}_season_${seasonId}`;

      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        setEpisodes(JSON.parse(cached));
        return;
      }

      let episodesData: EpisodeItem[] = [];

      if (useFallback) {
        episodesData = await streamingService.getEpisodeTMBD(
          tv_id,
          seasonNumberForApi
        );
      } else {
        const resp = await axios.get<{ episodes: EpisodeItem[] }>(
          `${Constants.expoConfig?.extra?.API_Backend}/movie/${slug}-${tv_id}/episodes`,
          { params: { seasonId } }
        );
        episodesData = resp.data.episodes.map((e: any) => ({
          id: e.id.toString(),
          number: e.number,
          title: e.title,
          description: e.description,
          img: e.img,
        }));
      }

      if (episodesData && episodesData.length > 0) {
        setEpisodes(episodesData);
        await AsyncStorage.setItem(cacheKey, JSON.stringify(episodesData));
      } else {
        console.warn("No episodes found for season", seasonId);
        setEpisodes([]);
      }
    } catch (err: any) {
      console.error("Episodes fetch error:", err);
      setError("Failed to load episodes");
      Alert.alert("Error", "Failed to load episodes.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tv_id, seasonId, slug, useFallback, cacheKey, season_number]);

  useEffect(() => {
    fetchEpisodes();
  }, [fetchEpisodes]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchEpisodes();
  };

  // Fetch sources for a given episode
  const fetchSources = async (episodeId: string) => {
    // Skip source fetching for fallback mode
    if (useFallback) {
      return;
    }

    try {
      setLoading(true);
      const resp = await streamingService.getEpisodeSources(
        tv_id.toString(),
        episodeId,
        slug
      );

      if (resp.servers && resp.servers.length > 0) {
        setSources(resp.servers);

        // Auto-select preferred source
        const preferred =
          resp.servers.find(
            (s) => s.name.toLowerCase().includes("vidcloud") || s.isVidstream
          ) || resp.servers[0];

        setSelectedSource(preferred);
      } else {
        setSources([]);
        setSelectedSource(null);
        Alert.alert("Error", "No streaming sources available");
      }
    } catch (error) {
      console.error("Failed to fetch sources:", error);
      Alert.alert("Error", "Failed to load streaming sources");
    } finally {
      setLoading(false);
    }
  };

  // Debounce guard
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const handleEpisodePress = (ep: EpisodeItem) => {
    if (debounceRef.current) return;

    setCurrentEpisode(ep);

    if (useFallback) {
      startStreaming(ep);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        await fetchSources(ep.id);
        if (selectedSource) {
          startStreaming(ep);
        } else {
          setModalVisible(true);
        }
      } catch (error) {
        console.error("Failed to fetch sources:", error);
        Alert.alert("Error", "Failed to load streaming sources");
      }
      debounceRef.current = null;
    }, 300);
  };
  const startStreaming = async (ep: EpisodeItem) => {
    try {
      setLoading(true);

      if (!ep.id.match(/^\d+$/) && !useFallback) {
        throw new Error("Invalid episode ID format");
      }

      if (useFallback) {
        navigation.navigate("Stream", {
          mediaType: "tvSeries",
          id: tv_id.toString(),
          videoTitle: `${seriesTitle} S${seasonNumberForApi}E${ep.number} - ${ep.title}`,
          slug,
          episodeId: ep.id,
          useFallback: true,
          seasonNumber: seasonNumberForApi,
          episodeNumber: ep.number.toString(),
        });
        return;
      }

      if (!selectedSource) {
        Alert.alert("Error", "No source selected");
        return;
      }

      if (!slug) {
        console.error("Slug is missing - cannot start streaming");
        Alert.alert("Error", "Missing series information");
        return;
      }

      console.log(
        `Starting stream with slug: ${slug}, episode: ${ep.id}, server: ${selectedSource.id}`
      );

      const info = await streamingService.getEpisodeStreamingUrl(
        tv_id.toString(),
        ep.id,
        selectedSource.id,
        slug
      );

      navigation.navigate("Stream", {
        mediaType: "tvSeries",
        id: tv_id.toString(),
        videoTitle: `${seriesTitle} S${seasonNumberForApi}E${ep.number} - ${ep.title}`,
        slug,
        streamUrl: info.streamUrl,
        sourceName: selectedSource.name,
        subtitles: info.subtitles,
        episodeId: ep.id,
      });
    } catch (err) {
      console.error("Stream error:", err);
      Alert.alert("Error", "Failed to start stream");
    } finally {
      setLoading(false);
    }
  };

  const handleSourceSelect = (src: any) => {
    setSelectedSource(src);
    setModalVisible(false);
    if (currentEpisode) startStreaming(currentEpisode);
  };

  const EpisodeRow = ({ item }: { item: EpisodeItem }) => (
    <TouchableOpacity
      style={styles.episodeItem}
      onPress={() => handleEpisodePress(item)}
    >
      <View style={styles.episodeRow}>
        <View style={styles.episodeThumbnail}>
          {item.img ? (
            <Image source={{ uri: item.img }} style={styles.episodeImage} />
          ) : (
            <View style={styles.episodePlaceholder}>
              <Text style={styles.episodePlaceholderText}>
                Ep {item.number}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.episodeInfo}>
          <Text style={styles.episodeTitle}>
            {item.number}. {item.title || item.name}
          </Text>
          {item.description && (
            <Text style={styles.episodeDescription} numberOfLines={2}>
              {item.description}
            </Text>
          )}
          {/* Only show source button for primary API */}
          {!useFallback && (
            <TouchableOpacity
              style={styles.sourceButton}
              onPress={(e) => {
                e.stopPropagation(); // Prevent episode press
                setCurrentEpisode(item);
                fetchSources(item.id);
                setModalVisible(true);
              }}
            >
              <Text style={styles.sourceButtonText}>
                Source: {selectedSource?.name || "Select"}
              </Text>
            </TouchableOpacity>
          )}
          {/* Show fallback indicator */}
          {useFallback && (
            <View style={styles.fallbackIndicator}>
              <Text style={styles.fallbackText}>Source 2</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
  const SourceModal = () => {
    if (useFallback) return null;
    <Modal
      visible={modalVisible}
      transparent
      animationType="slide"
      onRequestClose={() => setModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Select Source</Text>
          <FlatList
            data={sources}
            keyExtractor={(i) => i.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.sourceItem,
                  selectedSource?.id === item.id && styles.selectedSourceItem,
                ]}
                onPress={() => handleSourceSelect(item)}
              >
                <Text
                  style={[
                    styles.sourceText,
                    selectedSource?.id === item.id && styles.selectedSourceText,
                  ]}
                >
                  {item.name}
                </Text>
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setModalVisible(false)}
          >
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>;
  };

  if (loading && !episodes.length) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#FF5722" />
        <Text style={styles.loadingText}>Loading episodes…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={fetchEpisodes} style={styles.retryBtn}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>
        {seriesTitle} — {seasonName}
      </Text>
      <FlatList
        data={episodes}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => <EpisodeRow item={item} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
      <SourceModal />
      {loading && episodes.length > 0 && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FFF" />
          <Text style={styles.loadingOverlayText}>Setting up stream…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#121212", padding: 16 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#121212",
  },
  loadingText: { color: "#FFF", marginTop: 8 },
  errorText: { color: "#ff6b6b", textAlign: "center", margin: 16 },
  retryBtn: {
    backgroundColor: "#FF5722",
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  retryText: { color: "#FFF", fontWeight: "bold" },

  headerTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#FFF",
    marginBottom: 12,
  },
  episodeDescription: {
    color: "#AAA",
    fontSize: 14,
    marginTop: 4,
    lineHeight: 18,
  },

  fallbackIndicator: {
    marginTop: 8,
    backgroundColor: "#4CAF50",
    padding: 4,
    borderRadius: 4,
    alignSelf: "flex-start",
  },

  fallbackText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "bold",
  },
  episodeItem: {
    marginBottom: 12,
    backgroundColor: "#1e1e1e",
    borderRadius: 8,
    overflow: "hidden",
  },
  episodeRow: { flexDirection: "row", padding: 12 },
  episodeThumbnail: {
    width: 120,
    height: 68,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#2c2c2c",
  },
  episodeImage: { width: "100%", height: "100%" },
  episodePlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  episodePlaceholderText: { color: "#777" },
  episodeInfo: { flex: 1, marginLeft: 12 },
  episodeTitle: { color: "#FFF", fontSize: 16, fontWeight: "bold" },
  sourceButton: {
    marginTop: 8,
    backgroundColor: "#262626",
    padding: 6,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  sourceButtonText: { color: "#ffcc66", fontSize: 12 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    width: "90%",
    maxHeight: "70%",
    backgroundColor: "#1e1e1e",
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  sourceItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: "#333" },
  selectedSourceItem: { backgroundColor: "#7d0b02" },
  sourceText: { color: "#FFF", fontSize: 16 },
  selectedSourceText: { fontWeight: "bold" },
  closeButton: {
    marginTop: 16,
    backgroundColor: "#333",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  closeText: { color: "#FFF", fontSize: 16 },

  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingOverlayText: { color: "#FFF", marginTop: 12 },
});
