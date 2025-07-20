import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StatusBar,
  Dimensions,
  RefreshControl,
  Platform,
} from "react-native";
import { RouteProp, useRoute, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/types/navigation";
import axios from "axios";
import Constants from "expo-constants";
import { FontAwesome } from "@expo/vector-icons";
import streamingService from "@/utils/streamingService";
import tmdbDetailsService from "@/utils/detailsService";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

interface MovieDetails {
  title: string;
  description: string;
  type: "movie" | "tvSeries";
  stats: Array<{ name: string; value: string | string[] }>;
  poster?: string;
  episodeId?: string;
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
}

type MovieDetailScreenRouteProp = RouteProp<RootStackParamList, "MovieDetail">;

export default function MovieDetail(): JSX.Element {
  const route = useRoute<MovieDetailScreenRouteProp>();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const {
    movie_id,
    slug: initialSlug,
    title: initialTitle,
    poster: initialPoster,
    useFallback = false,
  } = route.params;

  const [loading, setLoading] = useState(true);
  const [streamLoading, setStreamLoading] = useState(false);
  const [activeStreamSource, setActiveStreamSource] = useState<string | null>(
    null
  );
  const [movieDetails, setMovieDetails] = useState<MovieDetails | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [imageError, setImageError] = useState(false);

  const fetchMovieDetails = useCallback(async () => {
    try {
      setLoading(true);

      console.log("=== MovieDetail Debug ===");
      console.log("movie_id:", movie_id);
      console.log("initialSlug:", initialSlug);
      console.log("initialTitle:", initialTitle);
      console.log("useFallback:", useFallback);

      if (useFallback) {
        const details = await tmdbDetailsService.getMovieDetails(movie_id);
        const transformedDetails: MovieDetails = {
          ...details,
          related: details.related || [],
        };
        setMovieDetails(transformedDetails);
      } else {
        const normalizedTitle = initialTitle?.replace(/^watch-/i, "") || "";
        const effectiveSlug =
          initialSlug || streamingService.slugify(normalizedTitle);

        console.log("Primary API - effectiveSlug:", effectiveSlug);
        console.log(
          "Primary API URL:",
          `${Constants.expoConfig?.extra?.API_Backend}/movie/${effectiveSlug}-${movie_id}`
        );

        const response = await axios.get(
          `${Constants.expoConfig?.extra?.API_Backend}/movie/${effectiveSlug}-${movie_id}`,
          {
            timeout: 10000, // 10 second timeout
          }
        );
        setMovieDetails(response.data);
      }
    } catch (err: any) {
      console.error("=== MovieDetail Error ===");
      console.error("Full error:", err);

      const errorMessage =
        err.response?.data?.message ||
        err.message ||
        "Failed to load movie details";

      Alert.alert("Error", errorMessage, [
        { text: "Retry", onPress: fetchMovieDetails },
        { text: "Cancel", style: "cancel" },
      ]);
    } finally {
      setLoading(false);
    }
  }, [movie_id, initialSlug, initialTitle, useFallback]);

  useEffect(() => {
    fetchMovieDetails();
  }, [fetchMovieDetails]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchMovieDetails().finally(() => setRefreshing(false));
  }, [fetchMovieDetails]);

  const handleStreamAction = async (sourceType: "primary" | "vidfast") => {
    try {
      setStreamLoading(true);
      setActiveStreamSource(sourceType);

      console.log(
        `Getting streaming URL for movie (${sourceType}):`,
        movie_id,
        "slug:",
        initialSlug,
        "useFallback:",
        useFallback
      );

      const info = await streamingService.getMovieStreamingUrl(
        sourceType === "vidfast" ? String(movie_id) : movie_id,
        sourceType === "vidfast" ? undefined : initialSlug,
        sourceType === "vidfast" ? false : useFallback,
        sourceType === "vidfast"
      );

      console.log(`${sourceType} stream info received:`, info.streamUrl);

      navigation.navigate("Stream", {
        mediaType: "movie" as const,
        id: String(movie_id),
        videoTitle: movieDetails?.title || initialTitle || "Untitled",
        streamUrl: info.streamUrl,
        sourceName:
          sourceType === "vidfast" ? "Vidfast" : info.selectedServer?.name,
        slug: initialSlug,
        subtitles: info.subtitles?.map((sub) => ({
          file: sub.file,
          label: sub.label,
          kind: sub.kind,
        })),
        useFallback: sourceType === "vidfast" ? true : useFallback,
        availableQualities: info.availableQualities || [],
      });
    } catch (error: any) {
      console.error(`Error getting ${sourceType} stream:`, error);
      Alert.alert(
        "Streaming Error",
        `Unable to get ${sourceType} streaming information.`,
        [{ text: "OK" }]
      );
    } finally {
      setStreamLoading(false);
      setActiveStreamSource(null);
    }
  };

  const handleWatchNow = () => handleStreamAction("primary");
  const handleVidfast = () => handleStreamAction("vidfast");

  const renderStats = () => {
    if (!movieDetails?.stats?.length) return null;

    return (
      <View style={styles.statsContainer}>
        {movieDetails.stats.map((stat, index) => (
          <View key={`${stat.name}-${index}`} style={styles.statItem}>
            <Text style={styles.statLabel}>{stat.name}</Text>
            <Text style={styles.statValue}>
              {Array.isArray(stat.value) ? stat.value.join(", ") : stat.value}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  const navigateToRelatedItem = (item: any) => {
    const itemType = item.stats?.seasons ? "tvSeries" : "movie";

    if (itemType === "tvSeries") {
      navigation.navigate("SeriesDetail", {
        tv_id: item.id,
        title: item.title,
        slug: item.slug,
        poster: item.poster,
        seasonId: item.seasonId,
      });
    } else {
      navigation.navigate("MovieDetail", {
        movie_id: item.id,
        slug: item.slug,
        title: item.title,
        poster: item.poster,
      });
    }
  };

  const renderRelatedContent = () => {
    if (!movieDetails?.related?.length) return null;

    return (
      <View style={styles.relatedSection}>
        <Text style={styles.sectionTitle}>You May Also Like</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.relatedScrollContainer}
        >
          {movieDetails.related.map((item: any, index: number) => (
            <TouchableOpacity
              key={`${item.id}-${index}`}
              style={styles.relatedItem}
              onPress={() => navigateToRelatedItem(item)}
              activeOpacity={0.8}
            >
              <Image
                source={{ uri: item.poster }}
                style={styles.relatedPoster}
                defaultSource={require("../../assets/images/Original.png")}
                onError={() =>
                  console.log(`Related poster failed to load: ${item.poster}`)
                }
              />
              <Text style={styles.relatedTitle} numberOfLines={2}>
                {item.title}
              </Text>
              {item.stats?.rating && (
                <View style={styles.relatedRating}>
                  <FontAwesome name="star" size={10} color="#FFD700" />
                  <Text style={styles.relatedRatingText}>
                    {item.stats.rating}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderStreamingButton = (
    title: string,
    onPress: () => void,
    sourceType: "primary" | "vidfast",
    style?: any
  ) => (
    <TouchableOpacity
      style={[styles.watchButton, style]}
      onPress={onPress}
      disabled={streamLoading}
      activeOpacity={0.8}
    >
      {streamLoading && activeStreamSource === sourceType ? (
        <ActivityIndicator size="small" color="#FFF" />
      ) : (
        <>
          <FontAwesome
            name="play"
            size={16}
            color="#FFF"
            style={styles.playIcon}
          />
          <Text style={styles.watchButtonText}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );

  const getRatingFromStats = () => {
    const ratingStat = movieDetails?.stats?.find(
      (stat) =>
        stat.name.toLowerCase().includes("rating") ||
        stat.name.toLowerCase().includes("imdb")
    );
    return ratingStat?.value;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#121212" />
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <FontAwesome name="arrow-left" size={20} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#FF5722" />
          <Text style={styles.loadingText}>Loading movie details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
        activeOpacity={0.8}
      >
        <FontAwesome name="arrow-left" size={20} color="#FFF" />
      </TouchableOpacity>

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#FF5722"]}
            tintColor="#FF5722"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Movie poster and overlay */}
        <View style={styles.posterContainer}>
          <Image
            source={{
              uri:
                !imageError && (movieDetails?.poster || initialPoster)
                  ? movieDetails?.poster || initialPoster
                  : undefined,
            }}
            style={styles.posterImage}
            defaultSource={require("../../assets/images/Original.png")}
            onError={() => setImageError(true)}
          />
          <View style={styles.posterGradient}>
            <Text style={styles.movieTitle}>
              {movieDetails?.title || initialTitle}
            </Text>
            {getRatingFromStats() && (
              <View style={styles.ratingContainer}>
                <FontAwesome name="star" size={14} color="#FFD700" />
                <Text style={styles.ratingText}>{getRatingFromStats()}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Streaming buttons */}
        <View style={styles.streamingSection}>
          <View style={styles.actionContainer}>
            {renderStreamingButton("Source One", handleWatchNow, "primary")}
          </View>

          <View style={styles.actionContainer}>
            {renderStreamingButton(
              "Source Two (HD)",
              handleVidfast,
              "vidfast",
              styles.secondaryButton
            )}
          </View>

          {useFallback && (
            <View style={styles.fallbackIndicator}>
              <Text style={styles.fallbackText}>Using Fallback Source</Text>
            </View>
          )}
        </View>

        {/* Description */}
        {movieDetails?.description && (
          <View style={styles.descriptionContainer}>
            <Text style={styles.sectionTitle}>Synopsis</Text>
            <Text style={styles.descriptionText}>
              {movieDetails.description}
            </Text>
          </View>
        )}

        {/* Stats information */}
        {movieDetails?.stats?.length > 0 && (
          <View style={styles.infoSection}>
            <Text style={styles.sectionTitle}>Details</Text>
            {renderStats()}
          </View>
        )}

        {/* Related content */}
        {renderRelatedContent()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  backButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 40,
    left: 16,
    zIndex: 10,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 25,
    width: 50,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#FFF",
    fontSize: 16,
    marginTop: 16,
  },
  posterContainer: {
    height: screenHeight * 0.4,
    position: "relative",
  },
  posterImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  posterGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingTop: 80,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "flex-end",
  },
  movieTitle: {
    color: "#FFF",
    fontSize: 28,
    fontWeight: "bold",
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    alignSelf: "flex-start",
  },
  ratingText: {
    color: "#FFD700",
    fontSize: 14,
    marginLeft: 6,
    fontWeight: "600",
  },
  streamingSection: {
    backgroundColor: "#1A1A1A",
    paddingVertical: 8,
  },
  actionContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  watchButton: {
    backgroundColor: "#FF5722",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    minHeight: 56,
    ...Platform.select({
      ios: {
        shadowColor: "#FF5722",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  secondaryButton: {
    backgroundColor: "#4CAF50",
    ...Platform.select({
      ios: {
        shadowColor: "#4CAF50",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  playIcon: {
    marginRight: 12,
  },
  watchButtonText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
  },
  fallbackIndicator: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "#2196F3",
    padding: 8,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  fallbackText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "bold",
  },
  descriptionContainer: {
    padding: 20,
    backgroundColor: "#1E1E1E",
    marginTop: 1,
  },
  sectionTitle: {
    color: "#FFF",
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 16,
  },
  descriptionText: {
    color: "#CCCCCC",
    fontSize: 16,
    lineHeight: 24,
    textAlign: "justify",
  },
  infoSection: {
    padding: 20,
    backgroundColor: "#1E1E1E",
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  statsContainer: {
    backgroundColor: "#2A2A2A",
    borderRadius: 12,
    padding: 16,
  },
  statItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#3A3A3A",
  },
  statLabel: {
    color: "#BBB",
    fontSize: 15,
    flex: 1,
  },
  statValue: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "600",
    flex: 2,
    textAlign: "right",
  },
  relatedSection: {
    padding: 20,
    backgroundColor: "#1E1E1E",
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  relatedScrollContainer: {
    paddingRight: 20,
  },
  relatedItem: {
    width: 140,
    marginRight: 16,
  },
  relatedPoster: {
    width: 140,
    height: 210,
    borderRadius: 12,
    backgroundColor: "#2A2A2A",
  },
  relatedTitle: {
    color: "#FFF",
    fontSize: 14,
    marginTop: 8,
    fontWeight: "500",
    textAlign: "center",
  },
  relatedRating: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  relatedRatingText: {
    color: "#FFD700",
    fontSize: 12,
    marginLeft: 4,
    fontWeight: "500",
  },
});
