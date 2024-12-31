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
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { RootStackParamList } from "@/types/navigation";

//type definations

type NavigationProp = NativeStackNavigationProp<RootStackParamList, "Movies">;

// Constants
const BACKEND_URL = "https://backendtorrent.onrender.com";
const { width } = Dimensions.get("window");
const MOVIE_API = "3d87c19403c5b4902b9617fc74eb3866";
// Type Definitions
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
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const navigation = useNavigation<NavigationProp>();

  //UseEffect ensure UI is Loaded
  useEffect(() => {
    console.log(torrents);
  }, [torrents]);

  // Fetch movies from API
  const fetchMovies = async (query: string) => {
    try {
      setIsSearching(true);
      setLoading(true);
      const cachedMovies = await AsyncStorage.getItem(query);
      if (cachedMovies) {
        setMovies(JSON.parse(cachedMovies));
      } else {
        const res = await axios.get(`http://localhost:5000/movie-info`, {
          params: { title: query },
        });
        console.log("API RESPONSE:", res.data);
        const movie: Movie = {
          Title: res.data.title || "N/A",
          Year: res.data.year || "N/A",
          Genre: res.data.genre || "N/A",
          Plot: res.data.plot || "No description available.",
          Poster: res.data.poster || "https://via.placeholder.com/100x150",
          imdbID: res.data.imdbID || query,
          imdbRating: res.data.imdbRating || "N/A",
          category: "Search",
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

  //Fetch Popular Movies
  const fetchPopularMovies = async () => {
    try {
      const res = await axios.get(
        "https://api.themoviedb.org/3/movie/popular",
        {
          params: { api_key: MOVIE_API, language: "en-US", page: 1 },
        },
      );
      const popularMovies = res.data.results.map((movie: TMDBMovie) => ({
        Title: movie.title,
        Year: movie.release_date.split("-")[0],
        Genre: "N/A",
        Plot: movie.overview || "No description available.",
        Poster: `https://image.tmdb.org/t/p/w500${movie.poster_path}`,
        imdbID: movie.id.toString(),
        imdbRating: "N/A",
        category: "Popular",
      }));
      setMovies((prev) => [...prev, ...popularMovies]);
    } catch (error) {
      console.log("Error Fetching Popular Movies", error);
      Alert.alert("Error Fetching Popular Movies Try again");
    } finally {
      setLoading(false);
    }
  };

  // Fetch torrents for a movie
  const fetchTorrents = async (movieTitle: string) => {
    try {
      setLoading(true); // Start loading
      const res = await axios.get(`http://localhost:5000/torrent`, {
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
  //Handle Torrent Download

  // Handle streaming the movie
  const handleStream = (magnetLink: string, videoTitle: string) => {
    if (!magnetLink) {
      Alert.alert("Error", "Invalid Link");
      return;
    }
    navigation.navigate("Stream", { magnetLink, videoTitle });
  };

  //collect the popular movies
  useEffect(() => {
    fetchPopularMovies();
  }, []);

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
        onChangeText={(text) => {
          setSearchTerm(text);
          if (!text.trim()) {
            setMovies([]);
            fetchPopularMovies();
          }
        }}
        onSubmitEditing={() => fetchMovies(searchTerm)}
      />
      {loading ? (
        <ActivityIndicator size="large" color="#FFF" />
      ) : (
        <FlatList
          data={movies}
          keyExtractor={(item) => item.imdbID}
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
              {isSearching ? "Search Results" : "Popular Movies"}
            </Text>
          }
        />
      )}
      <FlatList
        data={torrents}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item }) => (
          <View style={styles.torrentCard}>
            <Text style={styles.torrentName}>{item.name}</Text>
            <Text style={styles.torrentSize}>Size: {item.size}</Text>
            <TouchableOpacity
              style={styles.buttonStreamer}
              onPress={() => handleStream(item.magnet, item.name)}
            >
              <Text>Stream</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.buttonDownload}>
              <Text>Download</Text>
            </TouchableOpacity>
          </View>
        )}
      />
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
  torrentCard: {
    backgroundColor: "#1E1E1E",
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    marginTop: 6,
  },
  buttonStreamer: {
    backgroundColor: "#3bfc18",
    padding: 10,
    marginTop: 5,
    borderRadius: 10,
    marginBottom: 5,
  },
  buttonDownload: {
    backgroundColor: "#540007",
    padding: 6,
    marginTop: 5,
    marginBottom: 5,
    borderRadius: 10,
  },
  torrentName: {
    color: "#FFF",
    fontWeight: "bold",
    fontSize: 15,
  },
  torrentSize: {
    color: "#BBB",
    fontSize: 14,
    marginBottom: 8,
  },
  toggleContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  torrentAvailable: {
    color: "#FFF",
    marginTop: 5,
    fontWeight: "bold",
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
