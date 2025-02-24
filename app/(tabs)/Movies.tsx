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
import { useNavigation } from "@react-navigation/native";
import { RootStackParamList } from "@/types/navigation";
import * as FileSystem from "expo-file-system";
import { Buffer } from "buffer";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";

const DOWNLOADER_API = Constants.expoConfig?.extra?.API_Backend;
const { width } = Dimensions.get("window");
// Use your TMDB API key from expo config
const MOVIE_API = Constants.expoConfig?.extra?.TMBD_KEY; // If using TMBD_KEY, otherwise rename accordingly

// Define type for Movie/Series object
type Movie = {
  Title: string;
  Year: string;
  Genre: string;
  Plot: string;
  Poster: string;
  imdbID: string;
  imdbRating?: string;
  category?: string;
  hasTorrent?: boolean;
};

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
  name: string;
  magnet: string;
  size: string;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList, "Movies">;

export default function Movies(): JSX.Element {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [torrents, setTorrents] = useState<Torrent[]>([]);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isVisible, setVisible] = useState<boolean>(false);
  // Add a state for content type: "movie" or "series"
  const [contentType, setContentType] = useState<"movie" | "series">("movie");
  const navigation = useNavigation<NavigationProp>();

  // Fetch movies/series by search query.
  // If contentType is "movie", it calls the movie endpoint; if "series", it passes type="series".
  const fetchMovies = async (query: string) => {
    try {
      setIsSearching(true);
      setLoading(true);
      const cacheKey = query + "_" + contentType;
      const cachedMovies = await AsyncStorage.getItem(cacheKey);
      if (cachedMovies) {
        setMovies(JSON.parse(cachedMovies));
      } else {
        // Call the backend /search endpoint with type parameter.
        const res = await axios.get(`${DOWNLOADER_API}/search`, {
          params: { title: query, type: contentType },
        });
        console.log("API RESPONSE:", res.data);
        // Assume backend returns an object: { success: true, data: { ...metadata, torrents: [...] } }
        const data = res.data.data;
        const movie: Movie = {
          Title: data.title || "N/A",
          Year: data.release_date ? data.release_date.split("-")[0] : "N/A",
          Genre: data.genre || "N/A",
          Plot: data.overview || "No description available.",
          Poster: data.poster_path || "https://via.placeholder.com/100x150",
          imdbID: data.id ? data.id.toString() : query,
          imdbRating: data.imdbRating || "N/A",
          category: contentType === "series" ? "Series" : "Movie",
        };
        setMovies([movie]);
        await AsyncStorage.setItem(cacheKey, JSON.stringify([movie]));
      }
    } catch (error) {
      console.error("Error fetching movies:", error);
      Alert.alert(
        "Error",
        "Failed to fetch movie data. Please try again later."
      );
    } finally {
      setLoading(false);
      setIsSearching(false);
    }
  };

  // Fetch popular movies or popular series from TMDB based on contentType.

  const fetchPopular = async () => {
    try {
      setLoading(true);
      let url = "";
      if (contentType === "series") {
        url = "https://api.themoviedb.org/3/tv/popular";
      } else {
        url = "https://api.themoviedb.org/3/movie/popular";
      }
      const res = await axios.get(url, {
        params: { api_key: MOVIE_API, language: "en-US", page: 1 },
      });
      const popularContent = res.data.results.map((item: TMDBMovie) => {
        if (contentType === "series") {
          return {
            Title: item.name, // Use name for series
            Year: item.first_air_date
              ? item.first_air_date.split("-")[0]
              : "N/A",
            Genre: "N/A",
            Plot: item.overview || "No description available.",
            Poster: `https://image.tmdb.org/t/p/w500${item.poster_path}`,
            imdbID: item.id.toString(),
            imdbRating: "N/A",
            category: "Series",
          };
        } else {
          return {
            Title: item.title,
            Year: item.release_date ? item.release_date.split("-")[0] : "N/A",
            Genre: "N/A",
            Plot: item.overview || "No description available.",
            Poster: `https://image.tmdb.org/t/p/w500${item.poster_path}`,
            imdbID: item.id.toString(),
            imdbRating: "N/A",
            category: "Movie",
          };
        }
      });
      setMovies((prev) => [...prev, ...popularContent]);
    } catch (error) {
      console.log("Error Fetching Popular Content", error);
      Alert.alert("Error", "Fetching Popular content failed. Try again.");
    } finally {
      setLoading(false);
    }
  };
  // Fetch torrents for a selected movie/series title.
  const fetchTorrents = async (movieTitle: string) => {
    try {
      setLoading(true);
      const res = await axios.get(`${DOWNLOADER_API}/search`, {
        params: { title: movieTitle },
      });
      // Expect the torrents to be inside res.data.data.torrents or similar.
      // Adjust based on your backend response.
      if (res.data && res.data.data && Array.isArray(res.data.data.torrents)) {
        const validTorrents = res.data.data.torrents.filter(
          (torrent: Torrent) => torrent.magnet
        );
        setTorrents(validTorrents);
        if (validTorrents.length === 0) {
          Alert.alert(
            "No Torrents Found",
            "No valid torrents available for this title."
          );
        }
        setVisible(true);
      } else {
        throw new Error("Invalid torrents data format.");
      }
    } catch (error) {
      console.error("Error fetching torrents:", error);
      Alert.alert("Error Fetching Torrents");
    } finally {
      setLoading(false);
    }
  };

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
      // Ensure download folder exists.
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

  // Stream movie/series by navigating to the Stream screen.
  const handleStream = (magnetLink: string, videoTitle: string) => {
    if (!magnetLink) {
      Alert.alert("Error", "Invalid Link");
      return;
    }
    navigation.navigate("Stream", { magnetLink, videoTitle });
  };

  useEffect(() => {
    // When the component mounts or contentType changes, fetch popular content.
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
        value={searchTerm}
        onChangeText={(text) => {
          setSearchTerm(text);
          if (!text.trim()) {
            setMovies([]);
            fetchPopular();
          }
        }}
        onSubmitEditing={() => fetchMovies(searchTerm)}
      />

      {/* Movie/Series List */}
      {loading ? (
        <ActivityIndicator size="large" color="#FFF" />
      ) : (
        <FlatList
          data={movies}
          keyExtractor={(item) => item.imdbID + item.Title}
          renderItem={({ item }) => (
            <View style={styles.movieCard}>
              <Image source={{ uri: item.Poster }} style={styles.movieImage} />
              <View style={styles.movieDetails}>
                <Text style={styles.movieTitle}>{item.Title}</Text>
                <Text style={styles.movieDescription}>{item.Plot}</Text>
                <Text style={styles.movieRating}>
                  IMDb Rating: {item.imdbRating}
                </Text>
                {item.hasTorrent && (
                  <Text style={styles.torrentAvailable}>
                    Torrents Available
                  </Text>
                )}
                <TouchableOpacity
                  style={styles.button}
                  onPress={() => fetchTorrents(item.Title)}
                >
                  <Text style={styles.buttonText}>Get Torrents</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListHeaderComponent={
            <Text style={styles.sectionTitle}>
              {isSearching
                ? "Search Results"
                : "Popular " + (contentType === "series" ? "Series" : "Movies")}
            </Text>
          }
        />
      )}

      {/* Torrent Modal */}
      <Modal
        visible={isVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.Modalcontain}>
          <TouchableOpacity
            style={styles.buttonModal}
            onPress={() => setVisible(false)}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <FlatList
            data={torrents}
            keyExtractor={(item) => item.magnet}
            renderItem={({ item }) => (
              <View style={styles.torrentCard}>
                <Text style={styles.torrentName}>{item.name}</Text>
                <Text style={styles.torrentSize}>Size: {item.size}</Text>
                <TouchableOpacity
                  style={styles.buttonStreamer}
                  onPress={() => handleStream(item.magnet, item.name)}
                >
                  <Text style={styles.buttonText}>Stream</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.buttonDownload}
                  onPress={() => handleDownload(item.magnet, item.name)}
                >
                  <Text style={styles.buttonText}>Download</Text>
                </TouchableOpacity>
              </View>
            )}
          />
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
  typeButton: {
    padding: 10,
    backgroundColor: "#7d0b02",
    borderRadius: 5,
    marginHorizontal: 5,
  },
  activeType: {
    backgroundColor: "#FF5722",
  },
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
  buttonText: { color: "#FFF" },
  Modalcontain: {
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 40,
  },
  buttonModal: {
    backgroundColor: "#7d0b02",
    borderRadius: 10,
    padding: 10,
    marginVertical: 5,
  },
  torrentCard: {
    backgroundColor: "#1E1E1E",
    borderRadius: 10,
    padding: 10,
    marginVertical: 6,
  },
  torrentName: { color: "#FFF", fontWeight: "bold", fontSize: 15 },
  torrentSize: { color: "#BBB", fontSize: 14, marginBottom: 8 },
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
