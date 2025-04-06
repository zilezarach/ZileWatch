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
import Constants from "expo-constants";
import axios from "axios";

const TMDB_URL =
  Constants.expoConfig?.extra?.TMBD_URL || "https://api.themoviedb.org/3";
const TMDB_API_KEY = Constants.expoConfig?.extra?.TMBD_KEY;

interface Episode {
  id: number | string;
  name?: string;
  title?: string;
  episode_number?: number;
  number?: number;
  overview?: string;
  description?: string;
  still_path?: string | null;
  img?: string | null;
}

type EpisodeListRouteProp = RouteProp<RootStackParamList, "EpisodeList">;

interface EpisodeItemProps {
  item: Episode;
  onPress: (episode: Episode) => void;
  onSourcePress: () => void;
  selectedSource: any;
}

export default function EpisodeListScreen() {
  const route = useRoute<EpisodeListRouteProp>();
  const {
    tv_id,
    season_number,
    season_id,
    seasonName,
    seriesTitle,
    isFromBackend = false,
  } = route.params;

  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [sources, setSources] = useState<any[]>([]);
  const [selectedSource, setSelectedSource] = useState<any | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const isMounted = useRef(true);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Track component mount state for cleanup
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Error state handler
  const [error, setError] = useState<string | null>(null);

  // Fetch episodes based on source
  const fetchEpisodes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (isFromBackend) {
        // Use our backend service
        const cacheKey = `backend_episodes_${tv_id}_season_${
          season_id || season_number
        }`;
        const cachedData = await AsyncStorage.getItem(cacheKey);

        if (cachedData) {
          setEpisodes(JSON.parse(cachedData));
        } else {
          const seasonData = await streamingService.getSeasonWithEpisodes(
            tv_id.toString(),
            (season_id || season_number || 1).toString()
          );

          if (seasonData && seasonData.episodes) {
            // Normalize episode data
            const formattedEpisodes = seasonData.episodes.map((ep) => ({
              id: ep.id,
              name: ep.title,
              title: ep.title,
              number: ep.number,
              episode_number: ep.number,
              overview: ep.description,
              description: ep.description,
              img: ep.img,
              still_path: ep.still_path,
            }));

            setEpisodes(formattedEpisodes);
            await AsyncStorage.setItem(
              cacheKey,
              JSON.stringify(formattedEpisodes)
            );
          }
        }
      } else {
        // Use TMDB (keep your existing implementation)
        const cacheKey = `tmdb_episodes_${tv_id}_season_${season_number}`;
        const cachedData = await AsyncStorage.getItem(cacheKey);

        if (cachedData) {
          setEpisodes(JSON.parse(cachedData));
        } else {
          const response = await axios.get(
            `${TMDB_URL}/tv/${tv_id}/season/${season_number}`,
            {
              params: { api_key: TMDB_API_KEY, language: "en-US" },
            }
          );

          if (response.data && response.data.episodes) {
            setEpisodes(response.data.episodes);
            await AsyncStorage.setItem(
              cacheKey,
              JSON.stringify(response.data.episodes)
            );
          }
        }
      }
    } catch (error: any) {
      console.error("Episodes fetch error:", error);
      setError(error.message || "Failed to fetch episodes");
      Alert.alert("Error", "Failed to fetch episodes");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tv_id, season_id, season_number, isFromBackend]);

  useEffect(() => {
    fetchEpisodes();
  }, [fetchEpisodes]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchEpisodes();
  };

  // Handle episode selection with debounce to prevent double taps
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleEpisodePressWithDebounce = useCallback(
    (episode: Episode) => {
      if (debounceTimeout.current) return;

      // Get episode number and ID based on available properties
      const episodeNumber = episode.number || episode.episode_number;
      const episodeId = episode.id;

      if (!episodeNumber || !episodeId) {
        Alert.alert("Error", "Invalid episode information");
        return;
      }

      debounceTimeout.current = setTimeout(async () => {
        try {
          if (isFromBackend) {
            // For backend content, we need to set up streaming directly
            if (!selectedSource) {
              Alert.alert("Error", "No streaming source selected");
              return;
            }

            setLoading(true);

            try {
              // Get streaming info in one call
              const streamingInfo =
                await streamingService.getEpisodeStreamingInfo(
                  tv_id.toString(),
                  episodeId.toString()
                );

              if (streamingInfo && streamingInfo.streamUrl) {
                // Navigate directly to Stream screen with all info
                navigation.navigate("Stream", {
                  mediaType: "show",
                  id: tv_id,
                  sourceId: streamingInfo.selectedServer?.id,
                  episodeId: episodeId.toString(),
                  season: season_number?.toString() || "1",
                  episode: episodeNumber.toString(),
                  videoTitle: `${seriesTitle} S${
                    season_number || 1
                  }E${episodeNumber} - ${episode.name || episode.title}`,
                  // Direct stream info
                  streamUrl: streamingInfo.streamUrl,
                  subtitles: streamingInfo.subtitles,
                  sourceName: streamingInfo.selectedServer?.name,
                });
              } else {
                throw new Error("No stream URL available");
              }
            } catch (error) {
              console.error("Stream setup error:", error);
              Alert.alert(
                "Streaming Error",
                "Failed to set up streaming. Please try again."
              );
            } finally {
              setLoading(false);
            }
          } else {
            // For TMDB content, just navigate to Stream screen
            navigation.navigate("Stream", {
              mediaType: "show",
              id: tv_id,
              season: season_number?.toString() || "1",
              episode: episodeNumber.toString(),
              videoTitle: `${seriesTitle} S${
                season_number || 1
              }E${episodeNumber} - ${episode.name || episode.title}`,
            });
          }
        } finally {
          debounceTimeout.current = null;
        }
      }, 300);
    },
    [
      tv_id,
      season_number,
      seriesTitle,
      selectedSource,
      isFromBackend,
      navigation,
    ]
  );

  // Episode item component
  const EpisodeItem = ({
    item,
    onPress,
    onSourcePress,
    selectedSource,
  }: EpisodeItemProps) => {
    const episodeNumber = item.number || item.episode_number;

    return (
      <TouchableOpacity
        style={styles.episodeItem}
        onPress={() => onPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.episodeRow}>
          <View style={styles.episodeThumbnail}>
            {item.still_path || item.img ? (
              <Image
                source={{
                  uri:
                    item.img ||
                    (item.still_path
                      ? `https://image.tmdb.org/t/p/w300${item.still_path}`
                      : undefined),
                }}
                style={styles.episodeImage}
                defaultSource={require("../../assets/images/Original.png")}
              />
            ) : (
              <View style={styles.episodePlaceholder}>
                <Text style={styles.episodePlaceholderText}>
                  Ep {episodeNumber}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.episodeInfo}>
            <Text style={styles.episodeTitle}>
              {episodeNumber}.{" "}
              {item.name || item.title || `Episode ${episodeNumber}`}
            </Text>
            <Text style={styles.episodeOverview} numberOfLines={2}>
              {item.overview || item.description || "No description available."}
            </Text>

            {isFromBackend && (
              <TouchableOpacity
                style={styles.sourceButton}
                onPress={onSourcePress}
              >
                <Text style={styles.sourceButtonText}>
                  Source: {selectedSource?.name || "Select Source"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Source selection modal
  const SourceModal = () => {
    return (
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Source</Text>

            <FlatList
              data={sources}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.sourceItem,
                    selectedSource?.id === item.id && styles.selectedSourceItem,
                  ]}
                  onPress={() => {
                    setSelectedSource(item);
                    setModalVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.sourceItemText,
                      selectedSource?.id === item.id &&
                        styles.selectedSourceText,
                    ]}
                  >
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
              style={styles.sourcesList}
            />

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  // Show loading state
  if (loading && !episodes.length) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7d0b02" />
        <Text style={styles.loadingText}>Loading episodes...</Text>
      </View>
    );
  }

  // Show error state
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={fetchEpisodes} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.retryButton, { marginTop: 10 }]}
        >
          <Text style={styles.retryButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.seasonTitle}>
        {seriesTitle} - {seasonName}
      </Text>

      {episodes.length === 0 ? (
        <View style={styles.noEpisodesContainer}>
          <Text style={styles.noEpisodesText}>No episodes available</Text>
          <TouchableOpacity onPress={onRefresh} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={episodes}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <EpisodeItem
              item={item}
              onPress={handleEpisodePressWithDebounce}
              onSourcePress={() => setModalVisible(true)}
              selectedSource={selectedSource}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      {/* Source selection modal */}
      <SourceModal />

      {/* Loading overlay for stream setup */}
      {loading && episodes.length > 0 && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingOverlayText}>Setting up stream...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
    padding: 16,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#121212",
  },
  loadingText: {
    marginTop: 10,
    color: "#fff",
    fontSize: 16,
  },
  errorText: {
    fontSize: 16,
    color: "#ff6b6b",
    textAlign: "center",
    marginHorizontal: 20,
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: "#7d0b02",
    padding: 12,
    borderRadius: 8,
    minWidth: 120,
    alignItems: "center",
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  seasonTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 16,
  },
  episodeItem: {
    backgroundColor: "#1e1e1e",
    borderRadius: 8,
    marginBottom: 12,
    overflow: "hidden",
  },
  episodeRow: {
    flexDirection: "row",
    padding: 12,
  },
  episodeThumbnail: {
    width: 120,
    height: 68,
    borderRadius: 4,
    overflow: "hidden",
  },
  episodeImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "#2c2c2c",
  },
  episodePlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#2c2c2c",
    justifyContent: "center",
    alignItems: "center",
  },
  episodePlaceholderText: {
    color: "#777",
    fontSize: 14,
  },
  episodeInfo: {
    flex: 1,
    marginLeft: 12,
  },
  episodeTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 6,
  },
  episodeOverview: {
    fontSize: 14,
    color: "#aaa",
  },
  sourceButton: {
    marginTop: 8,
    backgroundColor: "#262626",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  sourceButtonText: {
    color: "#ffcc66",
    fontSize: 12,
  },
  noEpisodesContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  noEpisodesText: {
    color: "#aaa",
    fontSize: 16,
    marginBottom: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    width: "90%",
    backgroundColor: "#1e1e1e",
    borderRadius: 12,
    padding: 20,
    maxHeight: "70%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 16,
    textAlign: "center",
  },
  sourcesList: {
    marginBottom: 16,
  },
  sourceItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  selectedSourceItem: {
    backgroundColor: "#7d0b02",
  },
  sourceItemText: {
    fontSize: 16,
    color: "#fff",
  },
  selectedSourceText: {
    fontWeight: "bold",
  },
  closeButton: {
    backgroundColor: "#333",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  closeButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingOverlayText: {
    color: "#fff",
    marginTop: 12,
    fontSize: 16,
  },
});
