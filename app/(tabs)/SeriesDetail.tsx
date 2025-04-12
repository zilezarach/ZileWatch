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
  StatusBar,
} from "react-native";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RootStackParamList } from "@/types/navigation";
import Constants from "expo-constants";
import { FontAwesome } from "@expo/vector-icons";
import streamingService from "@/utils/streamingService";

type SeriesDetailRouteProp = RouteProp<RootStackParamList, "SeriesDetail">;

interface FlatSeriesPayload {
  title: string;
  description: string;
  type: "tvSeries";
  stats: Array<{ name: string; value: string | string[] }>;
  poster?: string;
  episodeId?: string | null;
  related: Array<{
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
  slug: string;
}

export default function SeriesDetail(): JSX.Element {
  const route = useRoute<SeriesDetailRouteProp>();
  const {
    tv_id,
    seasonId: seasonId,
    title: initialTitle,
    slug: initialSlug,
    poster: initialPoster,
  } = route.params;
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [data, setData] = useState<FlatSeriesPayload | null>(null);
  const [seasons, setSeasons] = useState<{ id: string; number: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detailsCacheKey = `backend_series_${tv_id}`;
  const seasonsCacheKey = `backend_seasons_${tv_id}-${
    initialSlug || streamingService.slugify(initialTitle || "")
  }`;

  // Fetch details + related

  const fetchDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Try cache first
      const cached = await AsyncStorage.getItem(detailsCacheKey);
      if (cached) {
        setData(JSON.parse(cached));
      } else {
        // 1) Fetch the flat payload
        const resp = await axios.get<FlatSeriesPayload>(
          `${Constants.expoConfig?.extra?.API_Backend}/movie/${initialSlug}-${tv_id}`
        );
        const flat = resp.data;
        setData(flat);
        await AsyncStorage.setItem(detailsCacheKey, JSON.stringify(flat));
      }
    } catch (err: any) {
      console.error("Series detail error:", err);
      setError("Failed to load series details");
      Alert.alert("Error", "Failed to load series details.");
    } finally {
      setLoading(false);
    }
  }, [tv_id]);

  // Fetch seasons using streamingService instead of direct axios call
  const fetchSeasons = useCallback(async () => {
    try {
      setError(null);
      //normalizedTitle
      const normalizedTitle = initialTitle?.replace(/^watch-/i, "") || "";
      const effectiveSlug =
        initialSlug || streamingService.slugify(normalizedTitle);
      // Try cache
      const cached = await AsyncStorage.getItem(seasonsCacheKey);
      if (cached) {
        setSeasons(JSON.parse(cached));
      } else {
        // Use streamingService to get seasons
        const seasonsData = await streamingService.getSeasons(
          tv_id,
          effectiveSlug
        );
        if (seasonsData.length > 0) {
          setSeasons(seasonsData);
          await AsyncStorage.setItem(
            seasonsCacheKey,
            JSON.stringify(seasonsData)
          );
        } else {
          console.warn("No seasons found for series:", tv_id);
        }
      }
    } catch (err: any) {
      console.error("Seasons fetch error:", err);
      Alert.alert("Error", "Failed to load seasons.");
    }
  }, [tv_id, initialSlug]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([fetchDetails(), fetchSeasons()])
      .catch((err) => {
        console.error("Refresh error:", err);
      })
      .finally(() => {
        setRefreshing(false);
      });
  }, [fetchDetails, fetchSeasons]);

  useEffect(() => {
    fetchDetails();
    fetchSeasons();
  }, [fetchDetails, fetchSeasons]);

  const navigateToEpisodeList = useCallback(
    (season: { id: string; number: number }) => {
      if (!data?.title) {
        Alert.alert("Error", "Series information not available");
        return;
      }

      navigation.navigate("EpisodeList", {
        tv_id,
        seasonId: season.id,
        slug: initialSlug || streamingService.slugify(data.title),
        seasonName: `Season ${season.number}`,
        seriesTitle: data.title || initialTitle,
        isFromBackend: true,
      });
    },
    [data, tv_id, navigation, initialSlug, initialTitle, seasonId]
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
        <TouchableOpacity style={styles.retryBtn} onPress={onRefresh}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { title, description, related, stats, poster } = data;
  const getRating = () => {
    if (!stats) return null;
    const ratingObj = stats.find(
      (stat) => stat.name === "Rating" || stat.name === "rating"
    );
    return ratingObj ? ratingObj.value : null;
  };

  const renderStats = () => {
    if (!stats) return null;

    return (
      <View style={styles.statsContainer}>
        {stats.map((stat, index) => (
          <View key={index} style={styles.statItem}>
            <Text style={styles.statLabel}>{stat.name}</Text>
            <Text style={styles.statValue}>
              {Array.isArray(stat.value) ? stat.value.join(", ") : stat.value}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />

      {/* Back button */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
      >
        <FontAwesome name="arrow-left" size={20} color="#FFF" />
      </TouchableOpacity>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Series poster and overlay */}
        <View style={styles.posterContainer}>
          <Image
            source={{
              uri: poster || initialPoster,
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
              {seasons.map((season) => (
                <TouchableOpacity
                  key={season.id}
                  style={styles.seasonItem}
                  onPress={() => navigateToEpisodeList(season)}
                >
                  <Text style={styles.seasonText}>Season {season.number}</Text>
                  <FontAwesome name="chevron-right" size={14} color="#888" />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.noSeasonsContainer}>
              <Text style={styles.noSeasons}>No seasons available</Text>
              <TouchableOpacity
                style={styles.retryBtnSmall}
                onPress={fetchSeasons}
              >
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
                    onPress={() =>
                      navigation.navigate(
                        stats.seasons ? "SeriesDetail" : "MovieDetail",
                        stats.seasons
                          ? {
                              tv_id: item.id,
                              title: item.title,
                              slug: itemSlug,
                              poster: item.poster,
                            }
                          : {
                              movie_id: item.id,
                              title: item.title,
                              slug: itemSlug,
                              poster: item.poster,
                            }
                      )
                    }
                  >
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
    backgroundColor: "#121212",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#121212",
  },
  loadingText: {
    color: "#FFF",
    marginTop: 8,
  },
  errorText: {
    color: "#ff6b6b",
    textAlign: "center",
    margin: 16,
  },
  retryBtn: {
    backgroundColor: "#FF5722",
    padding: 12,
    borderRadius: 8,
  },
  retryBtnSmall: {
    backgroundColor: "#FF5722",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  retryText: {
    color: "#FFF",
    fontWeight: "bold",
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
    alignItems: "center",
  },
  posterContainer: {
    height: 300,
    position: "relative",
  },
  posterImage: {
    width: "100%",
    height: "100%",
  },
  posterGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingTop: 60,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  seriesTitle: {
    color: "#FFF",
    fontSize: 24,
    fontWeight: "bold",
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  ratingText: {
    color: "#FFD700",
    fontSize: 14,
    marginLeft: 6,
  },
  actionContainer: {
    padding: 16,
    backgroundColor: "#1A1A1A",
  },
  watchButton: {
    backgroundColor: "#FF5722",
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  playIcon: {
    marginRight: 8,
  },
  watchButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  descriptionContainer: {
    padding: 16,
  },
  sectionTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  descriptionText: {
    color: "#DDD",
    fontSize: 15,
    lineHeight: 22,
  },
  infoSection: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  statsContainer: {
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    padding: 12,
  },
  statItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  statLabel: {
    color: "#BBB",
    fontSize: 14,
  },
  statValue: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "500",
  },
  seasonsSection: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  seasonsList: {
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
  },
  seasonItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  seasonText: {
    color: "#FFF",
    fontSize: 16,
  },
  noSeasonsContainer: {
    alignItems: "center",
    padding: 16,
  },
  noSeasons: {
    color: "#AAA",
    textAlign: "center",
  },
  relatedSection: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  relatedItem: {
    width: 120,
    marginRight: 12,
  },
  relatedPoster: {
    width: 120,
    height: 180,
    borderRadius: 8,
  },
  relatedTitle: {
    color: "#FFF",
    fontSize: 12,
    marginTop: 6,
  },
});
