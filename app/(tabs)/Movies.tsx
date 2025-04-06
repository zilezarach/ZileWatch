import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  Dimensions,
  Switch,
  Modal,
} from "react-native";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation, RouteProp, useRoute } from "@react-navigation/native";
import { RootStackParamList } from "@/types/navigation";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import streamingService, { SearchItem } from "@/utils/streamingService";

const { width } = Dimensions.get("window");
const TMDB_API_KEY = Constants.expoConfig?.extra?.TMBD_KEY;
const TMDB_API_URL = Constants.expoConfig?.extra?.TMBD_URL;

interface BaseMedia {
  Title: string;
  Year: string;
  Genre: string;
  Plot: string;
  Poster: string;
  imdbID: string;
  imdbRating?: string;
  category?: string;
  hasTorrent?: boolean;
  originalId?: number;
  duration?: string;
}

interface Movie extends BaseMedia {
  imdbID: string;
}

interface Series extends BaseMedia {
  tv_id: number;
}

type NavigationProp = RouteProp<RootStackParamList, "MovieDetail">;

export default function Movies(): JSX.Element {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [contentType, setContentType] = useState<"movie" | "series">("movie");
  const [streamLoading, setStreamLoading] = useState<boolean>(false);

  // ref to track mounted
  const isMounted = useRef(true);

  // Clean up when component umounts
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Fix: Make sure to properly type the navigation
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<NavigationProp>();

  // Fetch movies/series by search query (with caching)
  const fetchMovies = async (query: string) => {
    try {
      setIsSearching(true);
      setLoading(true);

      // Check cache first
      const cacheKey = `${query}_${contentType}`;
      const cachedMovies = await AsyncStorage.getItem(cacheKey);

      if (!isMounted.current) return;

      if (cachedMovies) {
        setMovies(JSON.parse(cachedMovies));
      } else {
        // Try to search from our streaming service first
        try {
          const streamResults = await streamingService.searchContent(
            query,
            contentType
          );

          if (streamResults && streamResults.length > 0) {
            // Format results to match our Movie interface
            const formattedResults = streamResults.map((item: any) => ({
              Title: item.title || "Unknown",
              Year: item.stats?.year || "N/A",
              Genre: item.stats?.genre || "N/A",
              Plot: item.overview || "No description available.",
              Poster: item.poster || "https://via.placeholder.com/100x150",
              imdbID: item.id.toString(),
              imdbRating: item.stats?.rating || "N/A",
              category: contentType === "series" ? "Series" : "Movie",
              // Store original data for direct streaming
              originalId: item.id,
              duration: item.stats?.duration || "N/A",
            }));

            if (!isMounted.current) return;
            setMovies(formattedResults);
            await AsyncStorage.setItem(
              cacheKey,
              JSON.stringify(formattedResults)
            );
            return;
          }
        } catch (err) {
          console.warn(
            "Streaming service search failed, falling back to TMDB:",
            err
          );
        }

        // Fallback to TMDB
        const url =
          contentType === "series"
            ? `${TMDB_API_URL}/search/tv`
            : `${TMDB_API_URL}/search/movie`;

        const res = await axios.get(url, {
          params: { api_key: TMDB_API_KEY, query, language: "en-US" },
        });

        if (!isMounted.current) return;

        const data = res.data.results.map((item: any) => ({
          Title: contentType === "series" ? item.name : item.title,
          Year:
            (contentType === "series"
              ? item.first_air_date
              : item.release_date
            )?.split("-")[0] || "N/A",
          Genre: item.genres?.[0]?.name || "N/A",
          Plot: item.overview || "No description available.",
          Poster: item.poster_path
            ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
            : "https://via.placeholder.com/100x150",
          imdbID: item.id.toString(),
          // Add tv_id for series to make it easier to navigate
          ...(contentType === "series" && { tv_id: item.id }),
          imdbRating: item.vote_average?.toString() || "N/A",
          category: contentType === "series" ? "Series" : "Movie",
        }));

        if (!isMounted.current) return;
        setMovies(data);
        await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
      }
    } catch (error) {
      console.error("Error fetching search results:", error);
      Alert.alert("Error", "Failed to fetch search results.");
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setIsSearching(false);
      }
    }
  };

  // Fetch popular movies or series from TMDB based on contentType.
  const fetchPopular = async () => {
    try {
      setLoading(true);
      const url =
        contentType === "series"
          ? `${TMDB_API_URL}/tv/popular`
          : `${TMDB_API_URL}/movie/popular`;

      const res = await axios.get(url, {
        params: { api_key: TMDB_API_KEY, language: "en-US", page: 1 },
      });

      const data = res.data.results.map((item: any) => ({
        Title: contentType === "series" ? item.name : item.title,
        Year:
          (contentType === "series"
            ? item.first_air_date
            : item.release_date
          )?.split("-")[0] || "N/A",
        Genre: item.genres?.[0]?.name || "N/A",
        Plot: item.overview || "No description available.",
        Poster: item.poster_path
          ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
          : "https://via.placeholder.com/100x150",
        imdbID: item.id.toString(),
        // Add tv_id for series to make it easier to navigate
        ...(contentType === "series" && { tv_id: item.id }),
        imdbRating: item.vote_average?.toString() || "N/A",
        category: contentType === "series" ? "Series" : "Movie",
      }));

      setMovies(data);
    } catch (error) {
      console.error("Error fetching popular content:", error);
      Alert.alert("Error", "Failed to fetch popular content.");
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  // New function to handle "Watch Now" directly
  const handleWatchNow = async (item: SearchItem) => {
    try {
      setStreamLoading(true);

      // Check if this is a direct streaming item from our service
      if (item.id) {
        // Directly navigate to streaming with all required data
        const movieId = item.id.toString();

        // Get streaming info in one call
        const streamInfo = await streamingService.getMovieStreamingInfo(
          item.id.toString()
        );
        navigation.navigate("Stream", {
          mediaType: "movie",
          id: item.id,
          videoTitle: item.title,
          streamUrl: streamInfo.streamUrl,
          subtitles: streamInfo.subtitles,
          sourceName: streamInfo.selectedServer?.name,
        });
      } else {
        // Fall back to regular navigation flow for TMDB items
        if (contentType === "series") {
          const tvId = item.id;
          navigation.navigate("SeriesDetail", {
            tv_id: tvId,
            title: item.title,
          });
        } else {
          navigation.navigate("Stream", {
            mediaType: "movie",
            id: item.id,
            videoTitle: item.title,
            // Default values since we don't have streaming info yet
            season: "0",
            episode: "0",
          });
        }
      }
    } catch (error) {
      console.error("Stream setup error:", error);
      Alert.alert(
        "Streaming Error",
        "Failed to set up streaming. Please try again."
      );
    } finally {
      setStreamLoading(false);
    }
  };

  // render series and Movies
  const MemoizedMovieItem = React.memo(({ item }: { item: any }) => (
    <View style={styles.movieCard}>
      <Image
        source={{ uri: item.Poster }}
        style={styles.movieImage}
        // Add default image fallback
        defaultSource={require("../../assets/images/Original.png")}
      />
      <View style={styles.movieDetails}>
        <Text style={styles.movieTitle}>{item.Title}</Text>
        <Text style={styles.movieDescription} numberOfLines={3}>
          {item.Plot}
        </Text>
        <Text style={styles.movieRating}>IMDb Rating: {item.imdbRating}</Text>

        {/* Show loading indicator when streaming is being set up */}
        {streamLoading ? (
          <ActivityIndicator size="small" color="#FF5722" />
        ) : (
          <TouchableOpacity
            style={styles.button}
            onPress={() => handleWatchNow(item)}
          >
            <Text style={styles.buttonText}>
              {contentType === "series" ? "View Seasons" : "Watch Now"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  ));

  //RenderItem
  const renderItem = ({ item }: { item: any }) => (
    <MemoizedMovieItem item={item} />
  );

  //flatlist optimizations
  const keyExtractor = React.useCallback(
    (item: any) => item.imdbID + item.Title,
    []
  );

  useEffect(() => {
    fetchPopular();
  }, [contentType]);

  return (
    <View style={[styles.container, isDarkMode && styles.darkMode]}>
      {/* Dark mode toggle */}
      <View style={styles.toggleContainer}>
        <Text style={styles.toggleLabel}>Dark Mode</Text>
        <Switch value={isDarkMode} onValueChange={setIsDarkMode} />
      </View>

      {/* Content Type Toggle */}
      <View style={styles.typeToggleContainer}>
        <TouchableOpacity
          style={[
            styles.typeButton,
            contentType === "movie" && styles.activeType,
          ]}
          onPress={() => setContentType("movie")}
        >
          <Text style={styles.typeButtonText}>Movies</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.typeButton,
            contentType === "series" && styles.activeType,
          ]}
          onPress={() => setContentType("series")}
        >
          <Text style={styles.typeButtonText}>Series</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <TextInput
        style={styles.searchBar}
        placeholder="Search for a title..."
        placeholderTextColor="#AAA"
        value={searchQuery}
        onChangeText={(text) => {
          setSearchQuery(text);
          if (!text.trim()) {
            setMovies([]);
            fetchPopular();
          }
        }}
        onSubmitEditing={() => fetchMovies(searchQuery)}
      />

      {/* List of Movies/Series */}
      {loading ? (
        <ActivityIndicator size="large" color="#FFF" />
      ) : (
        <FlatList
          data={movies}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={
            <Text style={styles.sectionTitle}>
              {isSearching
                ? "Search Results"
                : "Popular " + (contentType === "series" ? "Series" : "Movies")}
            </Text>
          }
          removeClippedSubviews={true}
          initialNumToRender={5}
          maxToRenderPerBatch={10}
          windowSize={10}
          getItemLayout={(data, index) => ({
            length: 170,
            offset: 170 * index,
            index,
          })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 10 },
  toggleContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  toggleLabel: { fontSize: 16, color: "#FFF" },
  typeToggleContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 10,
  },
  typeButton: {
    padding: 10,
    backgroundColor: "#7d0b02",
    borderRadius: 5,
    marginHorizontal: 5,
  },
  activeType: { backgroundColor: "#FF5722" },
  typeButtonText: { color: "#FFF", fontWeight: "bold" },
  searchBar: {
    backgroundColor: "#1E1E1E",
    borderRadius: 10,
    padding: 10,
    color: "#FFF",
    marginBottom: 20,
  },
  sectionTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "bold",
    marginVertical: 10,
  },
  movieCard: {
    flexDirection: "row",
    backgroundColor: "#1E1E1E",
    borderRadius: 10,
    padding: 10,
    marginVertical: 10,
    elevation: 5,
  },
  movieImage: { width: 100, height: 150, borderRadius: 10 },
  movieDetails: { flex: 1, marginLeft: 10 },
  movieTitle: { color: "#FFF", fontSize: 16, fontWeight: "bold" },
  movieDescription: { color: "#BBB", fontSize: 14, marginVertical: 5 },
  movieRating: { color: "#FFD700", fontSize: 14, marginVertical: 5 },
  button: {
    backgroundColor: "#FF5722",
    borderRadius: 10,
    padding: 10,
    marginTop: 5,
  },
  buttonText: { color: "#FFF", fontSize: 16 },
  darkMode: { backgroundColor: "#121212" },
});
