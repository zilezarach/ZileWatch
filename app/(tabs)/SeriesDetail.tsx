import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  StyleSheet,
  SafeAreaView,
  StatusBar
} from "react-native";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RootStackParamList } from "@/types/navigation";
import Constants from "expo-constants";
import { FontAwesome } from "@expo/vector-icons";
import streamingService from "@/utils/streamingService";
import tmdbDetailsService, { SeriesDetails } from "@/utils/detailsService";

type SeriesDetailRouteProp = RouteProp<RootStackParamList, "SeriesDetail">;

interface FlatSeriesPayload {
  title: string;
  description: string;
  type: "tvSeries";
  stats: Array<{ name: string; value: string | string[] }>;
  poster?: string;
  episodeId?: string | null;
  related?: Array<{
    id: string;
    title: string;
    poster: string;
    stats: {
      seasons?: string;
      rating?: string;
      year?: string;
      duration?: string;
    };
  }>;
  slug?: string;
  seasons?: Array<{
    id: string;
    number: number;
    season_number: number;
    name: string;
    episode_count: number;
    poster: string;
    year: string;
  }>;
}

interface SeasonItem {
  id: string;
  number?: number;
  season_number: number;
  name: string;
  episode_count: number;
  poster: string;
  year: string;
}

export default function SeriesDetail(): JSX.Element {
  const route = useRoute<SeriesDetailRouteProp>();
  const { tv_id, seasonId: seasonId, title: initialTitle, slug: initialSlug, poster: initialPoster } = route.params;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [data, setData] = useState<FlatSeriesPayload | null>(null);
  const [seasons, setSeasons] = useState<SeasonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Always use Source 2 (TMDB) - simplified cache keys
  const detailsCacheKey = `tmdb_series_${tv_id}`;
  const seasonsCacheKey = `tmdb_seasons_${tv_id}`;

  const getSeasonNumber = (season: SeasonItem): number => {
    return season.number ?? season.season_number ?? 1;
  };

  const getSeasonName = (season: SeasonItem): string => {
    if (season.name) return season.name;
    const seasonNum = getSeasonNumber(season);
    return `Season ${seasonNum}`;
  };

  // Simplified fetch details - always use TMDB (Source 2)
  const fetchDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      console.log("=== SeriesDetail Debug (TMDB Only) ===");
      console.log("tv_id:", tv_id);
      console.log("initialTitle:", initialTitle);

      // Try cache first
      const cached = await AsyncStorage.getItem(detailsCacheKey);
      if (cached) {
        const cachedData = JSON.parse(cached);
        setData(cachedData);

        // If seasons are included in cached data, use them
        if (cachedData.seasons && cachedData.seasons.length > 0) {
          setSeasons(cachedData.seasons);
        }

        setLoading(false);
        return;
      }

      // Always use TMDB fallback service
      const details = await tmdbDetailsService.getSeriesDetailsFallback(tv_id);

      if (details) {
        setData(details);

        // Cache the details
        await AsyncStorage.setItem(detailsCacheKey, JSON.stringify(details));

        // Set seasons if they're included in the details
        if (details.seasons && details.seasons.length > 0) {
          setSeasons(details.seasons);
          // Cache seasons separately too
          await AsyncStorage.setItem(seasonsCacheKey, JSON.stringify(details.seasons));
        }
      } else {
        throw new Error("No data received from TMDB");
      }
    } catch (err: any) {
      console.error("=== SeriesDetail Error ===");
      console.error("Full error:", err);

      const errorMessage = err.response?.data?.message || err.message || "Unknown error occurred";
      setError(`Failed to load series details: ${errorMessage}`);

      // Don't show alert immediately if we're refreshing
      if (!refreshing) {
        Alert.alert("Error", `Failed to load series details: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  }, [tv_id, detailsCacheKey, seasonsCacheKey, refreshing]);

  // Separate function to fetch additional seasons if needed
  const fetchAdditionalSeasons = useCallback(async () => {
    try {
      // If we already have seasons from details, don't fetch again
      if (seasons.length > 0) {
        return;
      }

      // Try cache first
      const cached = await AsyncStorage.getItem(seasonsCacheKey);
      if (cached) {
        const cachedSeasons = JSON.parse(cached);
        setSeasons(cachedSeasons);
        return;
      }

      // If no seasons from details and no cache, fetch the full series details again
      // to get the seasons data
      const seriesDetails = await tmdbDetailsService.getSeriesDetailsFallback(tv_id);
      if (seriesDetails && seriesDetails.seasons && seriesDetails.seasons.length > 0) {
        setSeasons(seriesDetails.seasons);
        await AsyncStorage.setItem(seasonsCacheKey, JSON.stringify(seriesDetails.seasons));
      }
    } catch (err: any) {
      console.error("Additional seasons fetch error:", err);
      // Don't show alert for this, as it's not critical if seasons are already loaded
    }
  }, [tv_id, seasons.length, seasonsCacheKey]);
  // Improved refresh function
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);

    try {
      // Clear cache to force fresh data
      await AsyncStorage.multiRemove([detailsCacheKey, seasonsCacheKey]);

      // Reset state
      setData(null);
      setSeasons([]);

      // Fetch fresh data
      await fetchDetails();
      await fetchAdditionalSeasons();
    } catch (err) {
      console.error("Refresh error:", err);
      setError("Failed to refresh data");
    } finally {
      setRefreshing(false);
    }
  }, [detailsCacheKey, seasonsCacheKey, fetchDetails, fetchAdditionalSeasons]);

  // Retry function for manual retry button
  const handleRetry = useCallback(async () => {
    setError(null);
    setLoading(true);

    try {
      // Clear cache and retry
      await AsyncStorage.multiRemove([detailsCacheKey, seasonsCacheKey]);
      await fetchDetails();
      await fetchAdditionalSeasons();
    } catch (err) {
      console.error("Retry error:", err);
    }
  }, [detailsCacheKey, seasonsCacheKey, fetchDetails, fetchAdditionalSeasons]);

  // Seasons-specific retry function
  const handleSeasonsRetry = useCallback(async () => {
    try {
      // Clear seasons cache and retry
      await AsyncStorage.removeItem(seasonsCacheKey);
      setSeasons([]);

      // Fetch series details again to get seasons
      const seriesDetails = await tmdbDetailsService.getSeriesDetailsFallback(tv_id);
      if (seriesDetails && seriesDetails.seasons && seriesDetails.seasons.length > 0) {
        setSeasons(seriesDetails.seasons);
        await AsyncStorage.setItem(seasonsCacheKey, JSON.stringify(seriesDetails.seasons));
      } else {
        Alert.alert("Info", "No seasons found for this series");
      }
    } catch (err) {
      console.error("Seasons retry error:", err);
      Alert.alert("Error", "Failed to load seasons");
    }
  }, [tv_id, seasonsCacheKey]);

  // Initial data loading
  useEffect(() => {
    const loadData = async () => {
      await fetchDetails();
      // Small delay to ensure details are loaded first
      setTimeout(() => {
        fetchAdditionalSeasons();
      }, 100);
    };

    loadData();
  }, [fetchDetails, fetchAdditionalSeasons]);

  const navigateToEpisodeList = useCallback(
    (season: SeasonItem) => {
      if (!data?.title) {
        Alert.alert("Error", "Series information not available");
        return;
      }

      const seasonNumber = getSeasonNumber(season);
      const seasonName = getSeasonName(season);
      const seasonYear = season.year;
      const effectiveSlug = initialSlug || streamingService.slugify(data.title);

      navigation.navigate("EpisodeList", {
        tv_id,
        seasonId: season.id,
        seasonNumberForApi: seasonNumber.toString(),
        seasonNumber: seasonNumber,
        slug: effectiveSlug,
        seasonName: `${seasonName}${seasonYear ? ` (${seasonYear})` : ""}`,
        seriesTitle: data.title || initialTitle,
        isFromBackend: false, // Always false since we're using TMDB
        useFallback: true // Always true since we're using TMDB
      });
    },
    [data, tv_id, navigation, initialSlug, initialTitle]
  );

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#FF5722" />
        <Text style={styles.loadingText}>Loading series…</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || "No data available."}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { title, description, related, stats, poster } = data;

  const getRating = () => {
    if (!stats) return null;
    const ratingObj = stats.find(stat => stat.name === "Rating" || stat.name === "rating");
    return ratingObj ? ratingObj.value : null;
  };

  const renderStats = () => {
    if (!stats) return null;

    return (
      <View style={styles.statsContainer}>
        {stats.map((stat, index) => (
          <View key={index} style={styles.statItem}>
            <Text style={styles.statLabel}>{stat.name}</Text>
            <Text style={styles.statValue}>{Array.isArray(stat.value) ? stat.value.join(", ") : stat.value}</Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />

      {/* Back button */}
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <FontAwesome name="arrow-left" size={20} color="#FFF" />
      </TouchableOpacity>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {/* Series poster and overlay */}
        <View style={styles.posterContainer}>
          <Image
            source={{
              uri: poster || initialPoster
            }}
            style={styles.posterImage}
            defaultSource={require("../../assets/images/Original.png")}
          />
          <View style={styles.posterGradient}>
            <Text style={styles.seriesTitle}>{title || initialTitle}</Text>
            {getRating() && (
              <View style={styles.ratingContainer}>
                <FontAwesome name="star" size={14} color="#FFD700" />
                <Text style={styles.ratingText}>{getRating()}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Description */}
        {description && (
          <View style={styles.descriptionContainer}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.descriptionText}>{description}</Text>
          </View>
        )}

        {/* Stats information */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Details</Text>
          {renderStats()}
        </View>

        {/* Seasons */}
        <View style={styles.seasonsSection}>
          <Text style={styles.sectionTitle}>Seasons</Text>
          {seasons.length > 0 ? (
            <View style={styles.seasonsList}>
              {seasons
                .sort((a, b) => getSeasonNumber(a) - getSeasonNumber(b))
                .map(season => (
                  <TouchableOpacity
                    key={season.id}
                    style={styles.seasonItem}
                    onPress={() => navigateToEpisodeList(season)}>
                    <Text style={styles.seasonText}>
                      {getSeasonName(season)}
                      {season.year ? ` (${season.year})` : ""}
                    </Text>
                    <FontAwesome name="chevron-right" size={14} color="#888" />
                  </TouchableOpacity>
                ))}
            </View>
          ) : (
            <View style={styles.noSeasonsContainer}>
              <Text style={styles.noSeasons}>No seasons available</Text>
              <TouchableOpacity style={styles.retryBtnSmall} onPress={handleSeasonsRetry}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Related Content */}
        {related && related.length > 0 && (
          <View style={styles.relatedSection}>
            <Text style={styles.sectionTitle}>You May Also Like</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {related.map((item, index) => {
                const itemSlug = streamingService.slugify(item.title);
                return (
                  <TouchableOpacity
                    key={index}
                    style={styles.relatedItem}
                    onPress={() => {
                      const itemType = item.stats && item.stats.seasons ? "tvSeries" : "movie";

                      if (itemType === "movie") {
                        navigation.navigate("MovieDetail", {
                          movie_id: item.id,
                          slug: itemSlug,
                          title: item.title,
                          poster: item.poster,
                          useFallback: true // Always use TMDB
                        });
                      } else {
                        navigation.navigate("SeriesDetail", {
                          tv_id: item.id,
                          title: item.title,
                          slug: itemSlug,
                          poster: item.poster,
                          seasonId: seasonId,
                          useFallback: true // Always use TMDB
                        });
                      }
                    }}>
                    <Image
                      source={{ uri: item.poster }}
                      style={styles.relatedPoster}
                      defaultSource={require("../../assets/images/Original.png")}
                    />
                    <Text style={styles.relatedTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212"
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#121212"
  },
  loadingText: {
    color: "#FFF",
    marginTop: 8
  },
  errorText: {
    color: "#ff6b6b",
    textAlign: "center",
    margin: 16
  },
  retryBtn: {
    backgroundColor: "#FF5722",
    padding: 12,
    borderRadius: 8
  },
  retryBtnSmall: {
    backgroundColor: "#FF5722",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 8
  },
  retryText: {
    color: "#FFF",
    fontWeight: "bold"
  },
  backButton: {
    position: "absolute",
    top: 16,
    left: 16,
    zIndex: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center"
  },
  posterContainer: {
    height: 300,
    position: "relative"
  },
  posterImage: {
    width: "100%",
    height: "100%"
  },
  posterGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingTop: 60,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end"
  },
  seriesTitle: {
    color: "#FFF",
    fontSize: 24,
    fontWeight: "bold"
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8
  },
  ratingText: {
    color: "#FFD700",
    fontSize: 14,
    marginLeft: 6
  },
  actionContainer: {
    padding: 16,
    backgroundColor: "#1A1A1A"
  },
  watchButton: {
    backgroundColor: "#FF5722",
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12
  },
  playIcon: {
    marginRight: 8
  },
  watchButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600"
  },
  descriptionContainer: {
    padding: 16
  },
  sectionTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12
  },
  descriptionText: {
    color: "#DDD",
    fontSize: 15,
    lineHeight: 22
  },
  infoSection: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#333"
  },
  statsContainer: {
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    padding: 12
  },
  statItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#333"
  },
  statLabel: {
    color: "#BBB",
    fontSize: 14
  },
  statValue: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "500"
  },
  seasonsSection: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#333"
  },
  seasonsList: {
    backgroundColor: "#1E1E1E",
    borderRadius: 8
  },
  seasonItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333"
  },
  seasonText: {
    color: "#FFF",
    fontSize: 16
  },
  noSeasonsContainer: {
    alignItems: "center",
    padding: 16
  },
  noSeasons: {
    color: "#AAA",
    textAlign: "center"
  },
  relatedSection: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#333"
  },
  relatedItem: {
    width: 120,
    marginRight: 12
  },
  relatedPoster: {
    width: 120,
    height: 180,
    borderRadius: 8
  },
  relatedTitle: {
    color: "#FFF",
    fontSize: 12,
    marginTop: 6
  }
});
