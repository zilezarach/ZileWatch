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
  Linking,
} from "react-native";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

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

  // Fetch movies from API
  const fetchMovies = async (query: string): Promise<void> => {
    if (!query.trim()) {
      Alert.alert("Error", "Please enter a valid search term.");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.get(`${BACKEND_URL}/movie-info`, {
        params: { title: query },
      });
      console.log("Movie API Response:", res.data); // Debugging
      const movie = res.data;
      if (!movie || !movie.title) {
        // Use lowercase if backend uses lowercase
        throw new Error("Invalid movie data received.");
      }
      setMovies([movie]);
      await AsyncStorage.setItem(query, JSON.stringify([movie])); // Cache the data
    } catch (error) {
      console.error("Error fetching movies:", error); // Log error
      Alert.alert(
        "Error",
        "Failed to fetch movie data. Please try again later.",
      );
    }
  };

  // Fetch torrents for a movie

  const fetchTorrents = async (title: string) => {
    setLoading(true);
    try {
      const response = await axios.get(
        `https://backendtorrent.onrender.com/torrent?title=${title}`,
      );
      setTorrents(response.data);
    } catch (error) {
      console.error("Error fetching torrents:", error);
    } finally {
      setLoading(false);
    }
  };

  // Handle streaming the movie
  const playMovie = (magnetLink: string): void => {
    Linking.openURL(magnetLink).catch(() =>
      Alert.alert(
        "Error",
        "Unable to open the magnet link. Please ensure you have a torrent client installed.",
      ),
    );
  };

  return (
    <View style={[styles.container, isDarkMode && styles.darkMode]}>
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
        <Text style={styles.loadingText}>Search To Get Started</Text>
      ) : (
        <FlatList
          data={movies}
          keyExtractor={(item) => item.imdbID}
          renderItem={({ item }) => (
            <View style={styles.movieCard}>
              <Image
                source={{
                  uri: item.Poster || "https://via.placeholder.com/100x150",
                }}
                style={styles.movieImage}
              />
              <View style={styles.movieDetails}>
                <Text style={styles.movieTitle}>{item.Title || "N/A"}</Text>
                <Text style={styles.movieDescription}>
                  {item.Plot || "No description available."}
                </Text>
                <Text style={styles.movieRating}>
                  IMDb Rating: {item.imdbRating || "N/A"}
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
                    style={styles.button}
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
    marginBottom: 20,
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
});
