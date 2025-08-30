import React, { useState, useEffect, useCallback, useRef } from "react";
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
  Animated,
} from "react-native";
import { RouteProp, useRoute, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../types/navigation";
import * as Haptics from "expo-haptics";
import axios from "axios";
import Constants from "expo-constants";
import { FontAwesome, MaterialIcons } from "@expo/vector-icons";
import streamingService from "../../utils/streamingService";
import tmdbDetailsService from "../../utils/detailsService";
import { StreamingInfo } from "../../utils/streamingService";

import type { IconProps } from "@expo/vector-icons/build/createIconSet";

type MaterialIconName = keyof typeof MaterialIcons.glyphMap;

const { height: screenHeight, width: screenWidth } = Dimensions.get("window");

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
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

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
    null,
  );
  const [movieDetails, setMovieDetails] = useState<MovieDetails | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(2500),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setToast(null));
  };

  useEffect(() => {
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  async function withRetries<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 2000,
  ): Promise<T> {
    let lastError: any;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastError = err;
        console.warn(`Retry ${attempt}/${maxRetries} failed: ${err.message}`);
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
    throw lastError;
  }

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
          `${Constants.expoConfig?.extra?.API_Backend}/movie/${effectiveSlug}-${movie_id}`,
        );

        const response = await axios.get(
          `${Constants.expoConfig?.extra?.API_Backend}/movie/${effectiveSlug}-${movie_id}`,
          {
            timeout: 10000,
          },
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

  const handleStreamAction = async (
    sourceType: "tmdb" | "vidfast" | "wootly",
  ) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }

    try {
      setStreamLoading(true);
      setActiveStreamSource(sourceType);
      showToast(`Loading ${sourceType} stream...`);

      const fetchStream = async () => {
        const movieIdStr = String(movie_id);

        switch (sourceType) {
          case "vidfast":
            return await streamingService.getMovieStreamingUrl(
              movieIdStr,
              undefined,
              false,
              true,
            );
          case "wootly":
            return await streamingService.getMovieStreamingUrl(
              movieIdStr,
              initialSlug,
              useFallback,
              false,
              true,
            );
          case "tmdb":
          default:
            return await streamingService.getMovieStreamingUrl(
              movieIdStr,
              initialSlug,
              true,
            );
        }
      };

      let info: StreamingInfo;
      if (sourceType === "vidfast" || sourceType === "wootly") {
        info = await withRetries(fetchStream);
      } else {
        info = await fetchStream();
      }

      showToast("Stream ready!");

      navigation.navigate("Stream", {
        mediaType: "movie" as const,
        id: String(movie_id),
        videoTitle: movieDetails?.title || initialTitle || "Untitled",
        streamUrl: info.streamUrl,
        sourceName:
          sourceType === "vidfast"
            ? "Vidfast"
            : sourceType === "wootly"
              ? "Wootly"
              : info.selectedServer?.name,
        slug: initialSlug,
        subtitles: info.subtitles?.map((sub) => ({
          file: sub.file,
          label: sub.label,
          kind: sub.kind,
        })),
        useFallback: sourceType !== "tmdb",
        availableQualities: info.availableQualities || [],
      });
    } catch (error: any) {
      console.error(`Error getting ${sourceType} stream:`, error);
      showToast(`Failed to load ${sourceType} stream`);

      Alert.alert(
        "Streaming Error",
        `Unable to get ${sourceType} streaming information. Try another source.`,
        [{ text: "OK" }],
      );
    } finally {
      setStreamLoading(false);
      setActiveStreamSource(null);
    }
  };

  const renderStats = () => {
    if (!movieDetails?.stats || movieDetails.stats.length === 0) return null;

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
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

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
    if (!movieDetails?.related || movieDetails.related.length === 0)
      return null;

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
              activeOpacity={0.7}
            >
              <Image
                source={{ uri: item.poster }}
                style={styles.relatedPoster}
                defaultSource={require("../../assets/images/Original.png")}
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
    sourceType: "tmdb" | "vidfast" | "wootly",
    style?: any,
    icon?: MaterialIconName,
  ) => (
    <TouchableOpacity
      style={[styles.watchButton, style]}
      onPress={onPress}
      disabled={streamLoading}
      activeOpacity={0.8}
      accessibilityLabel={`Play ${title}`}
      accessibilityRole="button"
    >
      {streamLoading && activeStreamSource === sourceType ? (
        <ActivityIndicator size="small" color="#FFF" />
      ) : (
        <>
          <MaterialIcons
            name={icon || "play-arrow"}
            size={18}
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
        stat.name.toLowerCase().includes("imdb"),
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
          accessibilityLabel="Go back"
          accessibilityRole="button"
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
        accessibilityLabel="Go back"
        accessibilityRole="button"
      >
        <FontAwesome name="arrow-left" size={20} color="#FFF" />
      </TouchableOpacity>

      <Animated.ScrollView
        style={{ transform: [{ scale: scaleAnim }] }}
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

        <View style={styles.streamingSection}>
          <View style={styles.actionContainer}>
            {renderStreamingButton(
              "TMDB Source",
              () => handleStreamAction("tmdb"),
              "tmdb",
              styles.primaryButton,
              "movie",
            )}
          </View>

          <View style={styles.actionContainer}>
            {renderStreamingButton(
              "Vidfast (HD)",
              () => handleStreamAction("vidfast"),
              "vidfast",
              styles.secondaryButton,
              "hd",
            )}
          </View>

          <View style={styles.actionContainer}>
            {renderStreamingButton(
              "Wootly (4K)",
              () => handleStreamAction("wootly"),
              "wootly",
              styles.thirdButton,
              "4k",
            )}
          </View>
        </View>

        {movieDetails?.description && (
          <View style={styles.descriptionContainer}>
            <Text style={styles.sectionTitle}>Synopsis</Text>
            <Text style={styles.descriptionText}>
              {movieDetails.description}
            </Text>
          </View>
        )}

        {movieDetails?.stats && movieDetails.stats.length > 0 && (
          <View style={styles.infoSection}>
            <Text style={styles.sectionTitle}>Details</Text>
            {renderStats()}
          </View>
        )}

        {renderRelatedContent()}
      </Animated.ScrollView>

      {toast && (
        <Animated.View style={[styles.toast, { opacity: fadeAnim }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
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
    top: Platform.OS === "ios" ? 60 : 40,
    left: 16,
    zIndex: 10,
    backgroundColor: "rgba(0,0,0,0.8)",
    borderRadius: 25,
    width: 50,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
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
    backgroundColor: "rgba(0,0,0,0.6)",
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
    paddingVertical: 12,
  },
  actionContainer: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  watchButton: {
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    minHeight: 56,
  },
  primaryButton: {
    backgroundColor: "#FF5722",
    elevation: 6,
    shadowColor: "#FF5722",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  secondaryButton: {
    backgroundColor: "#4CAF50",
    elevation: 6,
    shadowColor: "#4CAF50",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  thirdButton: {
    backgroundColor: "#2196F3",
    elevation: 6,
    shadowColor: "#2196F3",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  playIcon: {
    marginRight: 8,
  },
  watchButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
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
  toast: {
    position: "absolute",
    bottom: 100,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.9)",
    padding: 12,
    borderRadius: 8,
    zIndex: 1000,
    maxWidth: screenWidth - 40,
  },
  toastText: {
    color: "#fff",
    textAlign: "center",
    fontSize: 14,
  },
});
