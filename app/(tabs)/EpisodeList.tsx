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
import axios from "axios";
import Constants from "expo-constants";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { RootStackParamList } from "@/types/navigation";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  getDefaultSource,
  getSources,
  getSourcesforMedia,
} from "@/utils/sources";
const TMDB_URL =
  Constants.expoConfig?.extra?.TMBD_URL || "https://api.themoviedb.org/3";
const TMDB_API_KEY = Constants.expoConfig?.extra?.TMBD_KEY;
const BACKEND_URL = Constants.expoConfig?.extra?.API_Backend;

interface Episode {
  id: number;
  name: string;
  episode_number: number;
  overview: string;
  still_path: string | null;
  magnetLink?: string | null; // Optional, added by enrichment
}
type EpisodeListRouteProp = RouteProp<RootStackParamList, "EpisodeList">;

interface EpisodeItemProps {
  item: Episode;
  onPress: (episode: Episode) => void;
  onSourcePress: () => void;
}

interface DebouncedFunction {
  (episode: Episode): void;
  timeout: NodeJS.Timeout | null;
}

export default function EpisodeListScreen() {
  const route = useRoute<EpisodeListRouteProp>();
  const { tv_id, season_number, seasonName, seriesTitle } = route.params;
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [sources, setSources] = useState<any[]>([]);
  const [selectedSource, setSelectedSource] = useState<any | null>(null);
  const [contentType, setContentType] = useState<"movie" | "tv">("tv");
  const [modalVisiable, setModalVisiable] = useState(false);
  const isMounted = useRef(true);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  //useEffect for tracking component lifecycle
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);
  //UseEffect code to get available getSources
  useEffect(() => {
    const loadSources = async () => {
      try {
        const availableSources = await getSourcesforMedia(contentType);
        setSources(availableSources);
        const defaultSource =
          availableSources && availableSources.length > 0
            ? availableSources[0]
            : await getDefaultSource();
        setSelectedSource(defaultSource);
      } catch (error) {
        console.error("Unable to fetching Sources");
      }
    };
    loadSources();
  }, [contentType]);

  const fetchSeasonEpisodes = useCallback(async () => {
    try {
      setLoading(true);
      const cacheKey = `episodes_${tv_id}_season_${season_number}`;
      const cachedData = await AsyncStorage.getItem(cacheKey);
      let episodeData = [];

      if (!isMounted.current) return;

      // Fetch TMDB data
      if (cachedData) {
        episodeData = JSON.parse(cachedData);
      } else {
        const response = await axios.get(
          `${TMDB_URL}/tv/${tv_id}/season/${season_number}`,
          {
            params: { api_key: TMDB_API_KEY, language: "en-US" },
          }
        );
        if (!isMounted.current) return;
        episodeData = response.data.episodes;
        await AsyncStorage.setItem(cacheKey, JSON.stringify(episodeData));
      }

      // Fetch magnet links from backend (assuming /torrent/search exists
      const enrichedEpisodes = [];
      for (const episode of episodeData) {
        if (!isMounted.current) return;

        const query = `${seriesTitle} S${String(season_number).padStart(
          2,
          "0"
        )}E${String(episode.episode_number).padStart(2, "0")}`;

        try {
          const torrentResponse = await axios.get(
            `${BACKEND_URL}/torrent/search`,
            {
              params: { query },
            }
          );
          enrichedEpisodes.push({
            ...episode,
            magnetLink: torrentResponse.data.magnetLink,
          });
        } catch (error) {
          console.error(`Failed to fetch torrent for ${query}:`, error);
          enrichedEpisodes.push({ ...episode, magnetLink: null });
        }
      }

      if (!isMounted.current) return;
      setEpisodes(enrichedEpisodes);
    } catch (error) {
      if (isMounted.current) {
        Alert.alert("Error", "Failed to fetch episodes or torrents.");
        console.error("Episode fetch error:", error);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [tv_id, season_number, seriesTitle]);

  useEffect(() => {
    fetchSeasonEpisodes();
  }, [fetchSeasonEpisodes]);

  // Memoize the episode item for rendering efficiency
  const MemoizedEpisodeItem = React.memo<EpisodeItemProps>(
    ({ item, onPress, onSourcePress }) => (
      <TouchableOpacity
        style={styles.episodeItem}
        onPress={() => onPress(item)}
      >
        {item.still_path ? (
          <Image
            source={{
              uri: `https://image.tmdb.org/t/p/w200${item.still_path}`,
            }}
            style={styles.thumbnail}
            defaultSource={require("../../assets/images/Original.png")}
          />
        ) : (
          <View style={[styles.thumbnail, styles.placeholderThumbnail]}>
            <Text style={styles.placeholderText}>No Image</Text>
          </View>
        )}
        <View style={styles.episodeInfo}>
          <Text style={styles.episodeTitle}>
            Episode {item.episode_number}: {item.name}
          </Text>
          <Text style={styles.episodeOverview} numberOfLines={2}>
            {item.overview}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: "#444", marginTop: 5 }]}
          onPress={onSourcePress}
        >
          <Text style={styles.buttonText}>
            Source ({selectedSource?.name || "Alpha"})
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    )
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchSeasonEpisodes();
  };

  const keyExtractor = useCallback((item: any) => item.id.toString(), []);

  //handle episode to sources
  const handleEpisodePressWithDebounce = useCallback(
    (episode: Episode) => {
      if ((handleEpisodePressWithDebounce as DebouncedFunction).timeout) {
        return;
      }

      (handleEpisodePressWithDebounce as DebouncedFunction).timeout =
        setTimeout(() => {
          navigation.navigate("Stream", {
            mediaType: "tv",
            id: tv_id,
            sourceId: selectedSource?.id || sources[0]?.id || "",
            season: season_number,
            episode: episode.episode_number,
            videoTitle: `${seriesTitle} S${season_number}E${episode.episode_number} - ${episode.name}`,
          });
          (handleEpisodePressWithDebounce as DebouncedFunction).timeout = null;
        }, 300);
    },
    [tv_id, season_number, seriesTitle, selectedSource, sources, navigation]
  );

  // Initialize timeout property for our debounced function
  (handleEpisodePressWithDebounce as DebouncedFunction).timeout = null;

  // Fix the renderItem type error
  const renderEpisodeItem = useCallback(
    ({ item }: { item: Episode }) => (
      <MemoizedEpisodeItem
        item={item}
        onPress={handleEpisodePressWithDebounce}
        onSourcePress={() => setModalVisiable(true)}
      />
    ),
    [handleEpisodePressWithDebounce]
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7d0b02" />
      </View>
    );
  }

  if (episodes.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>No episodes found.</Text>
        <TouchableOpacity
          onPress={fetchSeasonEpisodes}
          style={styles.retryButton}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Season {season_number}: {seasonName}
      </Text>
      <FlatList
        data={episodes}
        keyExtractor={keyExtractor}
        renderItem={renderEpisodeItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        removeClippedSubviews={true}
        initialNumToRender={5}
        maxToRenderPerBatch={10}
        windowSize={10}
        getItemLayout={(data, index) => ({
          length: 110, // approximate height of episode item
          offset: 110 * index,
          index,
        })}
      />
      {/* Get available streams */}
      {modalVisiable && (
        <Modal
          visible={modalVisiable}
          animationType="fade"
          transparent
          onRequestClose={() => setModalVisiable(false)}
        >
          <View style={styles.modalContainer}>
            <FlatList
              data={sources}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.sourceItem}
                  onPress={() => {
                    setSelectedSource(item);
                    setModalVisiable(false);
                  }}
                >
                  <Text style={styles.sourceName}>{item.name}</Text>
                </TouchableOpacity>
              )}
              initialNumToRender={5}
              maxToRenderPerBatch={10}
            />
            <TouchableOpacity
              style={[styles.button, { marginTop: 20 }]}
              onPress={() => setModalVisiable(false)}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#fff" },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.9)",
    padding: 20,
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 20 },
  errorText: { fontSize: 16, color: "red" },
  retryButton: {
    marginTop: 10,
    backgroundColor: "#7d0b02",
    padding: 10,
    borderRadius: 5,
  },
  sourceName: {
    color: "#7d0b02",
    fontSize: 15,
  },
  button: {
    backgroundColor: "#7d0b02",
    padding: 15,
    borderRadius: 5,
    paddingTop: 5,
  },
  buttonText: {
    fontSize: 15,
    color: "#fff",
  },
  sourceItem: {
    padding: 15,
    borderBottomWidth: 1,
    width: "100%",
  },
  retryButtonText: { color: "#fff", fontSize: 16 },
  episodeItem: {
    flexDirection: "row",
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
  },
  thumbnail: { width: 80, height: 80, borderRadius: 5, marginRight: 10 },
  placeholderThumbnail: {
    backgroundColor: "#ccc",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: { fontSize: 10, color: "#333" },
  episodeInfo: { flex: 1 },
  episodeTitle: { fontSize: 18, fontWeight: "bold" },
  episodeOverview: { fontSize: 14, color: "#555", marginTop: 5 },
});
