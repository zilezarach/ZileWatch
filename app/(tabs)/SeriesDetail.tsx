import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  StyleSheet,
} from "react-native";
import axios from "axios";
import Constants from "expo-constants";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { RootStackParamList } from "@/types/navigation";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

const TMDB_URL =
  Constants.expoConfig?.extra?.TMBD_URL || "https://api.themoviedb.org/3";
const TMDB_API_KEY = Constants.expoConfig?.extra?.TMBD_KEY;

type SeriesDetailRouteProp = RouteProp<RootStackParamList, "SeriesDetail">;

export default function SeriesDetail(): JSX.Element {
  const route = useRoute<SeriesDetailRouteProp>();

  // Add console logs to debug the parameters received
  console.log("SeriesDetail route params:", route.params);

  // Destructure with defaults to prevent undefined errors
  const { tv_id = 0, title = "Unknown Series" } = route.params || {};

  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [seriesData, setSeriesData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSeriesDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (!tv_id) {
        throw new Error("Invalid series ID");
      }

      // Log the API request for debugging
      console.log(`Fetching series details for ID: ${tv_id}`);

      const cacheKey = `series_${tv_id}`;
      const cachedData = await AsyncStorage.getItem(cacheKey);

      if (cachedData) {
        console.log("Using cached series data");
        setSeriesData(JSON.parse(cachedData));
      } else {
        console.log(`Making API request to: ${TMDB_URL}/tv/${tv_id}`);
        const response = await axios.get(`${TMDB_URL}/tv/${tv_id}`, {
          params: { api_key: TMDB_API_KEY, language: "en-US" },
        });

        console.log("API response received:", response.status);
        setSeriesData(response.data);
        await AsyncStorage.setItem(cacheKey, JSON.stringify(response.data));
      }
    } catch (error: any) {
      console.error("Series Details Error:", error);
      setError(error.message || "Failed to fetch series details");
      Alert.alert("Error", "Failed to fetch series details.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tv_id]);

  useEffect(() => {
    fetchSeriesDetails();
  }, [fetchSeriesDetails]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchSeriesDetails();
  };

  // Show loading state
  if (loading && !seriesData) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7d0b02" />
        <Text style={styles.loadingText}>Loading series details...</Text>
      </View>
    );
  }

  // Show error state
  if (error || !seriesData) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {error || "No series data available."}
        </Text>
        <TouchableOpacity
          onPress={fetchSeriesDetails}
          style={styles.retryButton}
        >
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
      {/* Header: Series Poster and Info */}
      <View style={styles.seriesHeader}>
        {seriesData.poster_path ? (
          <Image
            source={{
              uri: `https://image.tmdb.org/t/p/w300${seriesData.poster_path}`,
            }}
            style={styles.seriesPoster}
          />
        ) : (
          <View style={styles.placeholderPoster}>
            <Text style={styles.placeholderText}>No Image</Text>
          </View>
        )}
        <View style={styles.seriesInfo}>
          <Text style={styles.seriesTitle}>{seriesData.name || title}</Text>
          <Text style={styles.seriesOverview} numberOfLines={3}>
            {seriesData.overview || "No description available."}
          </Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Seasons</Text>

      {seriesData.seasons && seriesData.seasons.length > 0 ? (
        <FlatList
          data={seriesData.seasons}
          keyExtractor={(item) =>
            item.id ? item.id.toString() : item.season_number.toString()
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.seasonItem}
              onPress={() => {
                console.log(
                  `Navigating to EpisodeList for season ${item.season_number}`
                );
                navigation.navigate("EpisodeList", {
                  tv_id,
                  season_number: item.season_number,
                  seasonName: item.name,
                  seriesTitle: seriesData.name,
                });
              }}
            >
              <Text style={styles.seasonText}>
                Season {item.season_number}: {item.name}
              </Text>
              <Text style={styles.episodeCount}>
                {item.episode_count} episodes
              </Text>
            </TouchableOpacity>
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      ) : (
        <Text style={styles.noSeasonsText}>No seasons available</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#121212",
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
  seriesHeader: {
    flexDirection: "row",
    marginBottom: 20,
  },
  seriesPoster: {
    width: 100,
    height: 150,
    borderRadius: 8,
  },
  placeholderPoster: {
    width: 100,
    height: 150,
    borderRadius: 8,
    backgroundColor: "#2c2c2c",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    color: "#777",
    fontSize: 14,
  },
  seriesInfo: {
    flex: 1,
    marginLeft: 15,
  },
  seriesTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#fff",
  },
  seriesOverview: {
    fontSize: 14,
    color: "#aaa",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 15,
    color: "#fff",
  },
  seasonItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    backgroundColor: "#1e1e1e",
    marginBottom: 8,
    borderRadius: 8,
  },
  seasonText: {
    fontSize: 18,
    color: "#fff",
  },
  episodeCount: {
    fontSize: 14,
    color: "#aaa",
    marginTop: 4,
  },
  noSeasonsText: {
    textAlign: "center",
    color: "#aaa",
    fontSize: 16,
    marginTop: 20,
  },
});
