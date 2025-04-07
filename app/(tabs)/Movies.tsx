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
} from "react-native";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { RootStackParamList } from "@/types/navigation";
import Constants from "expo-constants";
import streamingService, { SearchItem } from "@/utils/streamingService";

const { width } = Dimensions.get("window");

export default function Movies(): JSX.Element {
  const [homeInfo, setHomeInfo] = useState<{
    spotlight: any[];
    trending: { movies: any[]; tvSeries: any[] };
    latestMovies: any[];
    latestTvSeries: any[];
  } | null>(null);

  const [movies, setMovies] = useState<SearchItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [contentType, setContentType] = useState<"movie" | "series">("movie");
  const [streamLoading, setStreamLoading] = useState(false);

  const isMounted = useRef(true);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // — Fetch homepage /info
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(
          `${Constants.expoConfig?.extra?.API_Backend}/info`
        );
        setHomeInfo(res.data);
      } catch (e) {
        console.warn("Failed to load home info", e);
      }
    })();
  }, []);

  // — Search or cache
  const fetchContent = async (query: string) => {
    try {
      setIsSearching(true);
      setLoading(true);
      const key = `${query}_${contentType}`;
      const cached = await AsyncStorage.getItem(key);
      if (!isMounted.current) return;
      if (cached) {
        setMovies(JSON.parse(cached));
      } else {
        const results = await streamingService.searchContent(
          query,
          contentType
        );
        if (!isMounted.current) return;
        setMovies(results);
        await AsyncStorage.setItem(key, JSON.stringify(results));
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setIsSearching(false);
      }
    }
  };

  // — TMDB fallback for “popular”
  const fetchPopular = async () => {
    try {
      setLoading(true);
      const TMDB_KEY = Constants.expoConfig?.extra?.TMBD_KEY;
      const TMDB_URL = Constants.expoConfig?.extra?.TMBD_URL;
      const url =
        contentType === "series"
          ? `${TMDB_URL}/tv/popular`
          : `${TMDB_URL}/movie/popular`;
      const res = await axios.get(url, {
        params: { api_key: TMDB_KEY, language: "en-US", page: 1 },
      });
      const data = res.data.results.map((item: any) => ({
        id: item.id.toString(),
        title: contentType === "series" ? item.name : item.title,
        poster: item.poster_path
          ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
          : "https://via.placeholder.com/100x150",
        stats: {
          year: (contentType === "series"
            ? item.first_air_date
            : item.release_date
          )?.split("-")[0],
          rating: item.vote_average?.toString(),
        },
        type: contentType,
      }));
      setMovies(data);
    } catch (e) {
      Alert.alert("Error", "Failed to fetch popular content.");
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  // — Watch / View Seasons
  const handleWatchNow = async (item: SearchItem) => {
    try {
      setStreamLoading(true);
      if (item.type === "movie") {
        const info = await streamingService.getMovieStreamingUrl(item.id);
        navigation.navigate("Stream", {
          mediaType: "movie",
          id: item.id,
          videoTitle: item.title,
          streamUrl: info.streamUrl,
          subtitles: info.subtitles,
          sourceName: info.selectedServer.name,
        });
      } else {
        navigation.navigate("SeriesDetail", {
          tv_id: item.id,
          title: item.title,
        });
      }
    } catch (e) {
      Alert.alert("Error", "Failed to set up streaming.");
    } finally {
      setStreamLoading(false);
    }
  };

  // — FlatList item
  const MovieCard = React.memo(({ item }: { item: SearchItem }) => (
    <View style={styles.movieCard}>
      <Image
        source={{ uri: item.poster }}
        style={styles.movieImage}
        defaultSource={require("../../assets/images/Original.png")}
      />
      <View style={styles.movieDetails}>
        <Text style={styles.movieTitle}>{item.title}</Text>
        <Text style={styles.movieDescription} numberOfLines={3}>
          {item.stats.year || item.stats.seasons || ""}
        </Text>
        <Text style={styles.movieRating}>IMDb: {item.stats.rating}</Text>
        {streamLoading ? (
          <ActivityIndicator size="small" color="#FF5722" />
        ) : (
          <TouchableOpacity
            style={styles.button}
            onPress={() => handleWatchNow(item)}
          >
            <Text style={styles.buttonText}>
              {item.type === "series" ? "View Seasons" : "Watch Now"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  ));

  // — On contentType or searchQuery change
  useEffect(() => {
    if (searchQuery.trim()) {
      fetchContent(searchQuery);
    } else {
      fetchPopular();
    }
  }, [contentType, searchQuery]);

  return (
    <View style={[styles.container, styles.darkMode]}>
      {/* Dark mode */}
      <View style={styles.toggleContainer}>
        <Text style={styles.toggleLabel}>Dark Mode</Text>
        <Switch
          value={true}
          // you can wire up a real toggle if you like
          onValueChange={() => {}}
        />
      </View>

      {/* Spotlight carousel */}
      {homeInfo && homeInfo.spotlight && homeInfo.spotlight.length > 0 && (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={homeInfo.spotlight}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={{ marginRight: 10 }}
              onPress={() =>
                handleWatchNow({
                  id: item.id,
                  title: item.title,
                  poster: item.poster,
                  stats: { year: item.year, rating: item.rating },
                  type: contentType,
                })
              }
            >
              <Image
                source={{ uri: item.banner }}
                style={{
                  width: width * 0.8,
                  height: 150,
                  borderRadius: 10,
                }}
              />
            </TouchableOpacity>
          )}
        />
      )}

      {/* Trending */}
      {homeInfo && (
        <>
          <Text style={styles.sectionTitle}>
            Trending {contentType === "movie" ? "Movies" : "Series"}
          </Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={
              contentType === "movie"
                ? homeInfo.trending.movies
                : homeInfo.trending.tvSeries
            }
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={{ marginRight: 10 }}
                onPress={() =>
                  handleWatchNow({
                    id: item.id,
                    title: item.title,
                    poster: item.poster,
                    stats: item.stats,
                    type: contentType,
                  })
                }
              >
                <Image
                  source={{ uri: item.poster }}
                  style={{ width: 100, height: 150, borderRadius: 6 }}
                />
                <Text style={{ color: "#FFF", width: 100 }} numberOfLines={1}>
                  {item.title}
                </Text>
              </TouchableOpacity>
            )}
          />
        </>
      )}

      {/* Latest */}
      {homeInfo && (
        <>
          <Text style={styles.sectionTitle}>
            Latest {contentType === "movie" ? "Movies" : "Series"}
          </Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={
              contentType === "movie"
                ? homeInfo.latestMovies
                : homeInfo.latestTvSeries
            }
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={{ marginRight: 10 }}
                onPress={() =>
                  handleWatchNow({
                    id: item.id,
                    title: item.title,
                    poster: item.poster,
                    stats: item.stats,
                    type: contentType,
                  })
                }
              >
                <Image
                  source={{ uri: item.poster }}
                  style={{ width: 100, height: 150, borderRadius: 6 }}
                />
                <Text style={{ color: "#FFF", width: 100 }} numberOfLines={1}>
                  {item.title}
                </Text>
              </TouchableOpacity>
            )}
          />
        </>
      )}

      {/* Search Bar */}
      <TextInput
        style={styles.searchBar}
        placeholder="Search for a title..."
        placeholderTextColor="#AAA"
        value={searchQuery}
        onChangeText={(text) => setSearchQuery(text)}
        onSubmitEditing={() => fetchContent(searchQuery)}
      />

      {/* Main list */}
      {loading ? (
        <ActivityIndicator size="large" color="#FFF" />
      ) : (
        <FlatList
          data={movies}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <MovieCard item={item} />}
          ListHeaderComponent={
            <Text style={styles.sectionTitle}>
              {isSearching
                ? "Search Results"
                : "Popular " + (contentType === "series" ? "Series" : "Movies")}
            </Text>
          }
          removeClippedSubviews
          initialNumToRender={5}
          maxToRenderPerBatch={10}
          windowSize={10}
          getItemLayout={(_, index) => ({
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
  container: { flex: 1, padding: 10, backgroundColor: "#121212" },
  toggleContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  toggleLabel: { fontSize: 16, color: "#FFF" },
  sectionTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "bold",
    marginVertical: 10,
  },
  searchBar: {
    backgroundColor: "#1E1E1E",
    borderRadius: 10,
    padding: 10,
    color: "#FFF",
    marginVertical: 10,
  },
  movieCard: {
    flexDirection: "row",
    backgroundColor: "#1E1E1E",
    borderRadius: 10,
    padding: 10,
    marginVertical: 10,
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
  buttonText: { color: "#FFF", fontSize: 16, textAlign: "center" },
  darkMode: { backgroundColor: "#121212" },
});
