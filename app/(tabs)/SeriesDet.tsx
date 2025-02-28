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

export default function SeriesDetailScreen() {
  const route = useRoute<SeriesDetailRouteProp>();
  const { tv_id, title } = route.params;
  const navigation =
    useNavigation<
      NativeStackNavigationProp<RootStackParamList, "EpisodeList">
    >();
  const [seriesData, setSeriesData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchSeriesDetails = useCallback(async () => {
    try {
      setLoading(true);
      const cacheKey = `series_${tv_id}`;
      const cachedData = await AsyncStorage.getItem(cacheKey);
      if (cachedData) {
        setSeriesData(JSON.parse(cachedData));
      } else {
        const response = await axios.get(`${TMDB_URL}/tv/${tv_id}`, {
          params: { api_key: TMDB_API_KEY, language: "en-US" },
        });
        setSeriesData(response.data);
        await AsyncStorage.setItem(cacheKey, JSON.stringify(response.data));
      }
    } catch (error: any) {
      Alert.alert("Error", "Failed to fetch series details.");
      console.error("Series Details Error:", error);
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

  if (loading && !seriesData) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7d0b02" />
      </View>
    );
  }

  if (!seriesData) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>No series data available.</Text>
        <TouchableOpacity
          onPress={fetchSeriesDetails}
          style={styles.retryButton}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
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
        ) : null}
        <View style={styles.seriesInfo}>
          <Text style={styles.seriesTitle}>{seriesData.name}</Text>
          <Text style={styles.seriesOverview} numberOfLines={3}>
            {seriesData.overview}
          </Text>
        </View>
      </View>
      <Text style={styles.sectionTitle}>Seasons</Text>
      <FlatList
        data={seriesData.seasons}
        keyExtractor={(item) =>
          item.id ? item.id.toString() : item.season_number.toString()
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.seasonItem}
            onPress={() =>
              navigation.navigate("EpisodeList", {
                tv_id,
                season_number: item.season_number,
                seasonName: item.name,
              })
            }
          >
            <Text style={styles.seasonText}>
              Season {item.season_number}: {item.name}
            </Text>
          </TouchableOpacity>
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { fontSize: 16, color: "red" },
  retryButton: {
    marginTop: 10,
    backgroundColor: "#7d0b02",
    padding: 10,
    borderRadius: 5,
  },
  retryButtonText: { color: "#fff", fontSize: 16 },
  seriesHeader: { flexDirection: "row", marginBottom: 20 },
  seriesPoster: { width: 100, height: 150, borderRadius: 5 },
  seriesInfo: { flex: 1, marginLeft: 10 },
  seriesTitle: { fontSize: 22, fontWeight: "bold", marginBottom: 10 },
  seriesOverview: { fontSize: 14, color: "#555" },
  sectionTitle: { fontSize: 20, fontWeight: "bold", marginBottom: 10 },
  seasonItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: "#ccc" },
  seasonText: { fontSize: 18 },
});
