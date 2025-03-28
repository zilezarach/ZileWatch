import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  StyleSheet,
  Image
} from "react-native";
import axios from "axios";
import Constants from "expo-constants";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { RootStackParamList } from "@/types/navigation";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
const TMDB_URL = Constants.expoConfig?.extra?.TMBD_URL || "https://api.themoviedb.org/3";
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

export default function EpisodeListScreen() {
  const route = useRoute<EpisodeListRouteProp>();
  const { tv_id, season_number, seasonName, seriesTitle } = route.params;
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const fetchSeasonEpisodes = useCallback(async () => {
    try {
      setLoading(true);
      const cacheKey = `episodes_${tv_id}_season_${season_number}`;
      const cachedData = await AsyncStorage.getItem(cacheKey);
      let episodeData = [];

      // Fetch TMDB data
      if (cachedData) {
        episodeData = JSON.parse(cachedData);
      } else {
        const response = await axios.get(`${TMDB_URL}/tv/${tv_id}/season/${season_number}`, {
          params: { api_key: TMDB_API_KEY, language: "en-US" }
        });
        episodeData = response.data.episodes;
        await AsyncStorage.setItem(cacheKey, JSON.stringify(episodeData));
      }

      // Fetch magnet links from backend (assuming /torrent/search exists)
      const enrichedEpisodes = await Promise.all(
        episodeData.map(async (episode: Episode) => {
          const query = `${seriesTitle} S${String(season_number).padStart(
            2,
            "0"
          )}E${String(episode.episode_number).padStart(2, "0")}`;
          try {
            const torrentResponse = await axios.get(`${BACKEND_URL}/torrent/search`, {
              params: { query }
            });
            return { ...episode, magnetLink: torrentResponse.data.magnetLink };
          } catch (error) {
            console.error(`Failed to fetch torrent for ${query}:`, error);
            return { ...episode, magnetLink: null };
          }
        })
      );

      setEpisodes(enrichedEpisodes);
    } catch (error: any) {
      Alert.alert("Error", "Failed to fetch episodes or torrents.");
      console.error("Episode fetch error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tv_id, season_number, seriesTitle]);

  useEffect(() => {
    fetchSeasonEpisodes();
  }, [fetchSeasonEpisodes]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchSeasonEpisodes();
  };

  const handleEpisodePress = (episode: any) => {
    //Determine how you'll get a streaming URL for an episode.
    if (!episode.videoUrl) {
      Alert.alert("Error", "Streaming not available for this episode.");
      return;
    }
    navigation.navigate("Stream", {
      mediaType: "tv",
      id: tv_id,
      sourceId: "",
      season: season_number,
      episode: episode.episode_number,
      videoTitle: `${seriesTitle} S${season_number}E${episode.episode_number} - ${episode.name}`
    });
  };

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
        <TouchableOpacity onPress={fetchSeasonEpisodes} style={styles.retryButton}>
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
        keyExtractor={item => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.episodeItem} onPress={() => handleEpisodePress(item)}>
            {item.still_path ? (
              <Image
                source={{
                  uri: `https://image.tmdb.org/t/p/w200${item.still_path}`
                }}
                style={styles.thumbnail}
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
          </TouchableOpacity>
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 20 },
  errorText: { fontSize: 16, color: "red" },
  retryButton: {
    marginTop: 10,
    backgroundColor: "#7d0b02",
    padding: 10,
    borderRadius: 5
  },
  retryButtonText: { color: "#fff", fontSize: 16 },
  episodeItem: {
    flexDirection: "row",
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc"
  },
  thumbnail: { width: 80, height: 80, borderRadius: 5, marginRight: 10 },
  placeholderThumbnail: {
    backgroundColor: "#ccc",
    justifyContent: "center",
    alignItems: "center"
  },
  placeholderText: { fontSize: 10, color: "#333" },
  episodeInfo: { flex: 1 },
  episodeTitle: { fontSize: 18, fontWeight: "bold" },
  episodeOverview: { fontSize: 14, color: "#555", marginTop: 5 }
});
