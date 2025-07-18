import React, { useState, useEffect } from "react";
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
} from "react-native";
import { RouteProp, useRoute, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/types/navigation";
import axios from "axios";
import Constants from "expo-constants";
import { FontAwesome } from "@expo/vector-icons";
import streamingService from "@/utils/streamingService";
import tmdbDetailsService, {
  MovieDetails as detailsService,
} from "@/utils/detailsService";
import { title } from "process";

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
    useFallback,
  } = route.params;
  const [loading, setLoading] = useState(true);
  const [streamLoading, setStreamLoading] = useState(false);
  const [movieDetails, setMovieDetails] = useState<MovieDetails | null>(null);
  const { slugify } = streamingService;

  useEffect(() => {
    async function fetchMovieDetails() {
      try {
        setLoading(true);

        console.log("=== MovieDetail Debug ===");
        console.log("movie_id:", movie_id);
        console.log("initialSlug:", initialSlug);
        console.log("initialTitle:", initialTitle);
        console.log("useFallback:", useFallback);

        if (useFallback) {
          // Use the correct fallback service for TMDB details
          const details = await tmdbDetailsService.getMovieDetails(movie_id);
          const transformedDetails: MovieDetails = {
            ...details,
            related: details.related || [],
          };
          setMovieDetails(transformedDetails);
        } else {
          // Use primary streaming service - construct proper slug
          const normalizedTitle = initialTitle?.replace(/^watch-/i, "") || "";
          const effectiveSlug =
            initialSlug || streamingService.slugify(normalizedTitle);

          console.log("Primary API - effectiveSlug:", effectiveSlug);
          console.log(
            "Primary API URL:",
            `${Constants.expoConfig?.extra?.API_Backend}/movie/${effectiveSlug}-${movie_id}`
          );

          const response = await axios.get(
            `${Constants.expoConfig?.extra?.API_Backend}/movie/${effectiveSlug}-${movie_id}`
          );
          setMovieDetails(response.data);
        }
      } catch (err) {
        console.error("=== MovieDetail Error ===");
        console.error("Full error:", err);
        console.error("Error response:", err.response?.data);
        console.error("Error status:", err.response?.status);

        Alert.alert(
          "Error",
          `Failed to load movie details: ${
            err.response?.data?.message || err.message
          }`
        );
      } finally {
        setLoading(false);
      }
    }
    fetchMovieDetails();
  }, [movie_id, initialSlug, initialTitle, useFallback]);

  const handleWatchNow = async () => {
    try {
      setStreamLoading(true);
      console.log(
        "Getting streaming URL for movie:",
        movie_id,
        "slug:",
        initialSlug,
        "useFallback:",
        useFallback
      );

      const info = await streamingService.getMovieStreamingUrl(
        movie_id,
        initialSlug,
        useFallback
      );
      console.log("Stream info received:", info.streamUrl);

      navigation.navigate("Stream", {
        mediaType: "movie" as const,
        id: String(movie_id),
        videoTitle: movieDetails?.title || initialTitle || "Untitled",
        streamUrl: info.streamUrl,
        sourceName: info.selectedServer?.name,
        slug: initialSlug,
        subtitles: info.subtitles?.map((sub) => ({
          file: sub.file,
          label: sub.label,
          kind: sub.kind,
        })),
        useFallback: useFallback,
        availableQualities: info.availableQualities || [],
      });
    } catch (error) {
      console.error("Error getting movie stream:", error);
      Alert.alert(
        "Streaming Error",
        "Unable to get movie streaming information."
      );
    } finally {
      setStreamLoading(false);
    }
  };
  // vidfast
  const handleVidfast = async () => {
    setStreamLoading(true);
    try {
      const info = await streamingService.getMovieStreamingUrl(
        String(movie_id),
        undefined,
        false,
        true
      );
      console.log("Streaming to Vidfast", info.streamUrl);
      navigation.navigate("Stream", {
        mediaType: "movie",
        id: String(movie_id),
        videoTitle: title,
        streamUrl: info.streamUrl,
        sourceName: "Vidfast",
        useFallback: true,
      });
    } catch (err) {
      console.error("Unable to get vidfast stream", err);
      Alert.alert("Error", "Could not load HD stream.");
    } finally {
      setStreamLoading(false);
    }
  };

  // Display movie stats in a readable format
  const renderStats = () => {
    if (!movieDetails || !movieDetails.stats) return null;

    let statsArray = movieDetails.stats;
    return (
      <View style={styles.statsContainer}>
        {statsArray.map((stat, index) => (
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

  // Related content section
  const renderRelatedContent = () => {
    if (!movieDetails?.related || movieDetails.related.length === 0)
      return null;

    return (
      <View style={styles.relatedSection}>
        <Text style={styles.sectionTitle}>You May Also Like</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {movieDetails.related.map((item: any, index: number) => (
            <TouchableOpacity
              key={index}
              style={styles.relatedItem}
              onPress={() => {
                const itemType =
                  item.stats && item.stats.seasons ? "tvSeries" : "movie";

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
              }}
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
          ))}
        </ScrollView>
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

      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#FF5722" />
        </View>
      ) : (
        <ScrollView>
          {/* Movie poster and overlay */}
          <View style={styles.posterContainer}>
            <Image
              source={{ uri: movieDetails?.poster || initialPoster }}
              style={styles.posterImage}
              defaultSource={require("../../assets/images/Original.png")}
            />
            <View style={styles.posterGradient}>
              <Text style={styles.movieTitle}>
                {movieDetails?.title || initialTitle}
              </Text>
              {movieDetails?.stats && "rating" in movieDetails.stats && (
                <View style={styles.ratingContainer}>
                  <FontAwesome name="star" size={14} color="#FFD700" />
                  <Text style={styles.ratingText}>
                    {movieDetails.stats.rating as number}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Watch button */}
          <View style={styles.actionContainer}>
            <TouchableOpacity
              style={styles.watchButton}
              onPress={handleWatchNow}
              disabled={streamLoading}
            >
              {streamLoading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <FontAwesome
                    name="play"
                    size={16}
                    color="#FFF"
                    style={styles.playIcon}
                  />
                  <Text style={styles.watchButtonText}>Source One</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.actionContainer}>
            <TouchableOpacity
              style={styles.watchButton}
              onPress={handleVidfast}
              disabled={streamLoading}
            >
              {streamLoading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <FontAwesome
                    name="play"
                    size={16}
                    color="#FFF"
                    style={styles.playIcon}
                  />
                  <Text style={styles.watchButtonText}>Source Two</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          {useFallback && (
            <View style={styles.fallbackIndicator}>
              <Text style={styles.fallbackText}>Primary</Text>
            </View>
          )}

          {/* Description */}
          {movieDetails?.description && (
            <View style={styles.descriptionContainer}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.descriptionText}>
                {movieDetails.description}
              </Text>
            </View>
          )}

          {/* Stats information */}
          <View style={styles.infoSection}>
            <Text style={styles.sectionTitle}>Details</Text>
            {renderStats()}
          </View>

          {/* Related content */}
          {renderRelatedContent()}
        </ScrollView>
      )}
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
  loaderContainer: {
    flex: 1,
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
  movieTitle: {
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
