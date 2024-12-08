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
} from "react-native";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Video from "react-native-video";

// Constants
const BACKEND_URL = "https://backendtorrent.onrender.com";
const { width } = Dimensions.get("window");

// Type Definitions
type Movie = {
  Title: string;
  Year: string;
  Genre: string;
  Plot: string;
  Poster: string;
  imdbID: string;
  imdbRating?: string;
};

type Torrent = {
  name: string;
  magnet: string;
  size: string;
};

export default function Movies(): JSX.Element {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [torrents, setTorrents] = useState<Torrent[]>([]);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [streamUrl, setStreamUrl] = useState<string>("");

  //UseEffect ensure UI is Loaded
  useEffect(() => {
    console.log(torrents);
  }, [torrents]);

  // Fetch movies from API
  const fetchMovies = async (query: string) => {
    try {
      setLoading(true);
      const cachedMovies = await AsyncStorage.getItem(query);
      if (cachedMovies) {
        setMovies(JSON.parse(cachedMovies));
      } else {
        const res = await axios.get(`${BACKEND_URL}/movie-info`, {
          params: { title: query },
        });
        const movie: Movie = {
          Title: res.data.title || "N/A",
          Year: res.data.year || "N/A",
          Genre: res.data.genre || "N/A",
          Plot: res.data.plot || "No description available.",
          Poster: res.data.poster || "https://via.placeholder.com/100x150",
          imdbID: res.data.imdbID || query,
          imdbRating: res.data.imdbRating || "N/A",
        };
        setMovies([movie]);
        await AsyncStorage.setItem(query, JSON.stringify([movie]));
      }
    } catch (error) {
      console.error("Error fetching movies:", error);
      Alert.alert(
        "Error",
        "Failed to fetch movie data. Please try again later.",
      );
    } finally {
      setLoading(false);
    }
  };

  // Fetch torrents for a movie
  const fetchTorrents = async (movieTitle: string) => {
    try {
      setLoading(true); // Start loading
      const res = await axios.get(`${BACKEND_URL}/torrent`, {
        params: { title: movieTitle },
      });

      // Check if response data is an array and valid
      if (res.data && Array.isArray(res.data)) {
        const validTorrents = res.data.filter((torrent) => torrent.magnet); // Only valid torrents with magnets
        setTorrents(validTorrents);

        // Show alert if no valid torrents are found
        if (validTorrents.length === 0) {
          Alert.alert(
            "No Torrents Found",
            "No valid torrents available for this movie.",
          );
        }
      } else {
        throw new Error("Invalid torrents data format.");
      }
    } catch (error) {
      console.error("Error fetching torrents:", error);
      // Show a more detailed alert based on error
      Alert.alert("Error Fetching Torrents");
    } finally {
      setLoading(false); // Stop loading
    }
  };

  // Handle streaming the movie
  const playMovie = (magnetLink: string) => {
    if (!magnetLink) {
      Alert.alert("Error", "Invalid magnet link.");
      return;
    }
    const encodedLink = encodeURIComponent(magnetLink);
    setStreamUrl(`${BACKEND_URL}/stream?magnet=${encodedLink}`);
  };

  // Render Stream Video
  const renderStream = () => (
    <View style={styles.videoContainer}>
      <Video
        source={{ uri: streamUrl }}
        style={styles.videoPlayer}
        controls
        resizeMode="contain"
      />
      <TouchableOpacity style={styles.button} onPress={() => setStreamUrl("")}>
        <Text style={styles.buttonText}>Close Stream</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, isDarkMode && styles.darkMode]}>
      {/* Toggle Dark Mode */}
      <View style={styles.toggleContainer}>
        <Text style={styles.toggleLabel}>Dark Mode</Text>
        <Switch value={isDarkMode} onValueChange={setIsDarkMode} />
      </View>

      {/* Search Bar */}
      <TextInput
        style={styles.searchBar}
        placeholder="Search for a movie..."
        placeholderTextColor="#AAA"
        value={searchTerm}
        onChangeText={setSearchTerm}
        onSubmitEditing={() => fetchMovies(searchTerm)}
      />

      {/* Movies List */}
      <Text style={styles.sectionTitle}>Movies</Text>
      {loading ? (
        <ActivityIndicator size="large" color="#FF5722" />
      ) : movies.length === 0 ? (
        <Text style={styles.loadingText}>Search to get started</Text>
      ) : (
        <FlatList
          data={movies}
          keyExtractor={(item) => item.imdbID}
          renderItem={({ item }) => (
            <View style={styles.movieCard}>
              <Image
                source={{
                  uri: item.Poster,
                }}
                style={styles.movieImage}
              />
              <View style={styles.movieDetails}>
                <Text style={styles.movieTitle}>{item.Title}</Text>
                <Text style={styles.movieDescription}>{item.Plot}</Text>
                <Text style={styles.movieRating}>
                  IMDb Rating: {item.imdbRating}
                </Text>
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={styles.button}
                    onPress={() => fetchTorrents(item.Title)}
                  >
                    <Text style={styles.buttonText}>Get Torrents</Text>
                  </TouchableOpacity>
                </View>
                {torrents.length > 0 && (
                  <TouchableOpacity
                    style={styles.buttonStream}
                    onPress={() => playMovie(torrents[0].magnet)}
                  >
                    <Text style={styles.buttonText}>Stream</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        />
      )}

      {/* Render Stream if URL exists */}
      {streamUrl && renderStream()}
    </View>
  );
}

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
  },
  darkMode: {
    backgroundColor: "#121212",
  },
  toggleContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  toggleLabel: {
    color: "#FFF",
    fontSize: 16,
  },
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  movieImage: {
    width: 100,
    height: 150,
    borderRadius: 10,
  },
  movieDetails: {
    flex: 1,
    marginLeft: 10,
  },
  movieTitle: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  movieDescription: {
    color: "#BBB",
    fontSize: 14,
    marginVertical: 5,
  },
  movieRating: {
    color: "#FFD700",
    fontSize: 14,
    marginVertical: 5,
  },
  actionButtons: {
    flexDirection: "row",
    marginTop: 10,
  },
  button: {
    backgroundColor: "#FF5722",
    borderRadius: 10,
    padding: 10,
    marginRight: 10,
  },
  buttonText: {
    color: "#FFF",
  },
  loadingText: {
    color: "#FFF",
    textAlign: "center",
  },
  buttonStream: {
    padding: 10,
    marginTop: 5,
    borderRadius: 10,
    backgroundColor: "#117000",
  },
  videoContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  videoPlayer: {
    width: "100%",
    height: 300,
  },
});
