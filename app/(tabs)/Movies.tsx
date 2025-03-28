import React, { useState, useEffect } from "react";
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
import * as FileSystem from "expo-file-system";
import { Buffer } from "buffer";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import {
  getSources,
  getDefaultSource,
  getSourcesforMedia,
} from "@/utils/sources";

const DOWNLOADER_API = Constants.expoConfig?.extra?.API_Backend;
const { width } = Dimensions.get("window");
const TMDB_API_KEY = Constants.expoConfig?.extra?.TMBD_KEY;
const TMDB_API_URL = "https://api.themoviedb.org/3";

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
}

interface Movie extends BaseMedia {
  imdbID: string;
}

interface Series extends BaseMedia {
  tv_id: number;
}

type TMDBMovie = {
  title: string;
  release_date: string;
  overview: string;
  poster_path: string;
  id: number;
  first_air_date: string;
  name: string;
};

type Torrent = {
  title: string;
  magnet: string;
  size: string;
  seeds: number;
  provider: string;
  infoHash: string;
  files: TorrentFile[];
};

interface TorrentFile {
  name: string;
  size: string;
  index: number;
}

type NavigationProp = RouteProp<RootStackParamList, "Movies">;

export default function Movies(): JSX.Element {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [torrents, setTorrents] = useState<Torrent[]>([]);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isVisible, setVisible] = useState<boolean>(false);
  const [contentType, setContentType] = useState<"movie" | "series">("movie");
  const [selectedSource, setSelectedSource] = useState<any | null>(null);
  const [sourceModalVisiable, setSourceModalVisiable] = useState(false);
  const [sources, setSources] = useState<any[]>([]);

  //useEffect to get available sources on the API_Backend
  useEffect(() => {
    const loadSources = async () => {
      try {
        const availableSources = await getSourcesforMedia(contentType);
        // Save the list of sources in state for the modal
        setSources(availableSources);
        // Set default source from available sources or fallback to getDefaultSource
        const defaultSource =
          availableSources && availableSources.length > 0
            ? availableSources[0]
            : await getDefaultSource();
        setSelectedSource(defaultSource);
      } catch (error) {
        console.log("Unable to fetch sources", error);
      }
    };
    loadSources();
  }, [contentType]);
  // Fix: Make sure to properly type the navigation
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<NavigationProp>();

  // Fetch movies/series by search query (with caching)
  const fetchMovies = async (query: string) => {
    try {
      setIsSearching(true);
      setLoading(true);
      const cacheKey = `${query}_${contentType}`;
      const cachedMovies = await AsyncStorage.getItem(cacheKey);

      if (cachedMovies) {
        setMovies(JSON.parse(cachedMovies));
      } else {
        const url =
          contentType === "series"
            ? `${TMDB_API_URL}/search/tv`
            : `${TMDB_API_URL}/search/movie`;

        const res = await axios.get(url, {
          params: { api_key: TMDB_API_KEY, query, language: "en-US" },
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
        console.log(movies);
        await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
      }
    } catch (error) {
      console.error("Error fetching search results:", error);
      Alert.alert("Error", "Failed to fetch search results.");
    } finally {
      setLoading(false);
      setIsSearching(false);
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
      console.log(movies);
    } catch (error) {
      console.error("Error fetching popular content:", error);
      Alert.alert("Error", "Failed to fetch popular content.");
    } finally {
      setLoading(false);
    }
  };
  // render series and Movies
  // Fix the navigation part in renderItem function of Movies.tsx

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.movieCard}>
      <Image source={{ uri: item.Poster }} style={styles.movieImage} />
      <View style={styles.movieDetails}>
        <Text style={styles.movieTitle}>{item.Title}</Text>
        <Text style={styles.movieDescription} numberOfLines={3}>
          {item.Plot}
        </Text>
        <Text style={styles.movieRating}>IMDb Rating: {item.imdbRating}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => {
            if (contentType === "series") {
              // Navigate to SeriesDetail screen
              const tvId = item.tv_id || parseInt(item.imdbID, 10);
              navigation.navigate("SeriesDetail", {
                tv_id: tvId,
                title: item.Title,
              });
            } else {
              // For movies, only pass the required information for the Stream component to handle
              navigation.navigate("Stream", {
                mediaType: "movie",
                id: parseInt(item.imdbID, 10),
                videoTitle: item.Title,
                sourceId: selectedSource?.id || sources[0]?.id || "",
                season: 0,
                episode: 0,
              });
            }
          }}
        >
          <Text style={styles.buttonText}>
            {contentType === "series" ? "View Seasons" : "Watch Now"}
          </Text>
        </TouchableOpacity>
        {/* Button to choose source */}
        {contentType === "movie" && (
          <TouchableOpacity
            style={[styles.button, { backgroundColor: "#444", marginTop: 5 }]}
            onPress={() => setSourceModalVisiable(true)}
          >
            <Text style={styles.buttonText}>
              Change Source ({selectedSource.name})
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
  // Download torrent file and save it to device storage.
  const handleDownload = async (magnetLink: string, videoTitle: string) => {
    if (!magnetLink) {
      Alert.alert("Error", "Invalid Link");
      return;
    }

    try {
      setLoading(true);
      const res = await axios.get(`${DOWNLOADER_API}/download-torrents`, {
        params: { magnet: magnetLink },
        responseType: "arraybuffer",
        onDownloadProgress: (progressEvent) => {
          const total = progressEvent.total || 1;
          const fractionProgress = progressEvent.loaded / total;
          console.log(
            `Downloading ${videoTitle}: ${Math.round(fractionProgress * 100)}%`
          );
        },
      });

      const downloadDir = `${FileSystem.documentDirectory}Downloads/`;
      const directoryInfo = await FileSystem.getInfoAsync(downloadDir);

      if (!directoryInfo.exists) {
        await FileSystem.makeDirectoryAsync(downloadDir, {
          intermediates: true,
        });
      }

      const fileUri = `${downloadDir}${videoTitle}.torrent`;
      const base64Data = Buffer.from(res.data).toString("base64");

      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      Alert.alert("Download Complete", `Downloaded: ${videoTitle}`);
    } catch (error) {
      console.error("Error Downloading File", error);
      Alert.alert("Failed to Download file. Please Try Again");
    } finally {
      setLoading(false);
    }
  };

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
          keyExtractor={(item) => item.imdbID + item.Title}
          renderItem={renderItem}
          ListHeaderComponent={
            <Text style={styles.sectionTitle}>
              {isSearching
                ? "Search Results"
                : "Popular " + (contentType === "series" ? "Series" : "Movies")}
            </Text>
          }
        />
      )}
      {/* Get available streams */}
      <Modal
        visible={sourceModalVisiable}
        animationType="slide"
        transparent
        onRequestClose={() => setSourceModalVisiable(false)}
      >
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>Select Source</Text>
          <FlatList
            data={sources}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.sourceItem}
                onPress={() => {
                  setSelectedSource(item);
                  setSourceModalVisiable(false);
                }}
              >
                <Text style={styles.sourceName}>{item.name}</Text>
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity
            style={[styles.button, { marginTop: 20 }]}
            onPress={() => setSourceModalVisiable(false)}
          >
            <Text style={styles.buttonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
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
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    color: "#fff",
    marginBottom: 20,
  },
  sourceItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#444",
    width: "100%",
  },
  sourceName: {
    color: "#7d0b02",
    fontSize: 15,
  },
  fileText: {
    color: "#7d0b02",
    fontWeight: "bold",
  },
  typeButton: {
    padding: 10,
    backgroundColor: "#7d0b02",
    borderRadius: 5,
    marginHorizontal: 5,
  },
  fileButton: {
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
  torrentAvailable: { color: "#FFF", marginTop: 5, fontWeight: "bold" },
  button: {
    backgroundColor: "#FF5722",
    borderRadius: 10,
    padding: 10,
    marginTop: 5,
  },
  buttonText: { color: "#FFF", fontSize: 16 },
  buttonStreamer: {
    backgroundColor: "#3bfc18",
    padding: 10,
    marginTop: 5,
    borderRadius: 10,
  },
  buttonDownload: {
    backgroundColor: "#540007",
    padding: 6,
    marginTop: 5,
    borderRadius: 10,
  },
  darkMode: { backgroundColor: "#121212" },
});
