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

type EpisodeListRouteProp = RouteProp<RootStackParamList, "EpisodeList">;

interface EpisodeItem {
  id: string;
  number: number;
  name: string;
  description?: string;
  img?: string;
}

export default function EpisodeListScreen() {
  const route = useRoute<EpisodeListRouteProp>();
  const { tv_id, seasonName, season_number, seriesTitle, slug, seasonId } =
    route.params;

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
      setLoading(true);
      setError(null);
      const cacheKey = `backend_episodes_${tv_id}_season_${seasonId}`;

      // Try cache
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        setEpisodes(JSON.parse(cached));
        setLoading(false);
        return;
      }

      // Hit your new endpoint:
      // GET /movie/:id/episodes?seasonId=<seasonId>
      const resp = await axios.get<{
        episodes: Array<{ id: string; number: number; title: string }>;
      }>(
        `${Constants.expoConfig?.extra?.API_Backend}/movie/${slug}-${tv_id}/episodes`,
        { params: { seasonId: seasonId } }
      );

      // Normalize
      const formatted = resp.data.episodes.map((e) => ({
        id: e.id,
        number: e.number,
        name: e.title,
      }));

      setEpisodes(formatted);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(formatted));
    } catch (err: any) {
      console.error("Episodes fetch error:", err);
      setError("Failed to load episodes");
      Alert.alert("Error", "Failed to load episodes.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tv_id, seasonId, slug]);

  useEffect(() => {
    fetchEpisodes();
  }, [fetchEpisodes]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchEpisodes();
  };

  // Fetch sources for a given episode
  const fetchSources = useCallback(
    async (episodeId: string) => {
      try {
        setLoading(true);
        const sourcesData = await streamingService.getEpisodeSources(
          tv_id.toString(),
          episodeId,
          slug
        );
        setSources(sourcesData.servers);
        const def =
          sourcesData.servers.find((s) => s.name === "Vidcloud") ||
          sourcesData.servers[0];
        setSelectedSource(def || null);
      } catch (err) {
        console.error("Sources fetch error:", err);
        Alert.alert("Error", "Failed to load sources.");
      } finally {
        setLoading(false);
      }
    },
    [tv_id, slug]
  );

  // Debounce guard
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const handleEpisodePress = (ep: EpisodeItem) => {
    if (debounceRef.current) return;
    setCurrentEpisode(ep);

    debounceRef.current = setTimeout(async () => {
      try {
        await fetchSources(ep.id);
        // if we got a default source, start immediately
        if (selectedSource) {
          startStreaming(ep);
        } else {
          setModalVisible(true);
        }
      } catch {}
      debounceRef.current = null;
    }, 300);
  };

  const startStreaming = async (ep: EpisodeItem) => {
    if (!selectedSource) {
      Alert.alert("Error", "No source selected");
      return;
    }
    try {
      setLoading(true);

      // Add episode validation
      if (!ep.id.match(/^\d+$/)) {
        throw new Error("Invalid episode ID format");
      }

      // Make sure slug is defined and not empty
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
        episode: ep.number.toString(),
        videoTitle: `${seriesTitle} S${season_number}E${ep.number} - ${ep.name}`,
        slug,
        streamUrl: info.streamUrl,
        sourceName: selectedSource.name,
        subtitles: info.subtitles,
      });
    } catch (err) {
      console.error("Stream error:", err);
      Alert.alert("Error", "Failed to start stream: ");
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
            {item.number}. {item.name}
          </Text>
          <TouchableOpacity
            style={styles.sourceButton}
            onPress={() => {
              setCurrentEpisode(item);
              fetchSources(item.id);
              setModalVisible(true);
            }}
          >
            <Text style={styles.sourceButtonText}>
              Source: {selectedSource?.name || "Select"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  const SourceModal = () => (
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
    </Modal>
  );

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
