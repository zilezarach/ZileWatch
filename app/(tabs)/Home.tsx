import React, { useState, useEffect } from "react";
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Image,
  FlatList,
  Modal,
  StyleSheet,
  Switch,
  Alert,
} from "react-native";
import {
  fetchPopularVids,
  fetchYouTubeSearchResults,
} from "@/utils/apiService";
import VideoList from "@/components/videoList";
import ModalPick from "@/components/DownloadPrompt";
import axios from "axios";

//Types
type Video = {
  Title: string;
  Plot: string;
  Formats: string[];
  Poster: string;
};

export default function Home({ navigation }: any) {
  const [videos, setVideos] = useState([]);
  const [downloadVids, setDownloadVids] = useState<Video[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [isModalVisable, setModalVisable] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState("");
  const [isDarkMode, setisDarkMode] = useState<boolean>(true);
  const [isVisible, setVisible] = useState(false);

  //handle search function
  const handleSearch = async () => {
    if (!searchQuery) return;

    setLoading(true);
    const isURL =
      searchQuery.startsWith("http://") || searchQuery.startsWith("https://");

    if (isURL) {
      await fetchByUrl(searchQuery); // Fetch video details for direct URL
    } else {
      try {
        const results = await fetchYouTubeSearchResults(searchQuery); // Search for YouTube videos
        setVideos(results || []);
      } catch (error) {
        console.error("Error Fetching Videos", error);
      }
    }
    setLoading(false);
  };

  //Fetch Social Media
  const fetchByUrl = async (url: string) => {
    try {
      setLoading(true);
      const res = await axios.get("http://localhost:5000/download-videos", {
        params: { url },
      });
      console.log("Response:", res.data);
      const formatsArray = Array.isArray(res.data.formats)
        ? res.data.formats
        : typeof res.data.formats === "string"
          ? res.data.formats.split(",").map((format: string) => format.trim())
          : Object.keys(res.data.formats);

      const socialDownload: Video = {
        Title: res.data.title,
        Plot: "Download",
        Poster: res.data.thumbnail,
        Formats: formatsArray,
      };
      setDownloadVids([socialDownload]);
    } catch (error) {
      console.error("Error Fetching Videos", error);
      Alert.alert("Error", "Unable to Fetch Data from Url");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadVideos = async () => {
      try {
        const popularVids = await fetchPopularVids();
        setVideos(popularVids || []);
      } catch (error) {
        console.log("Failed to load Videos", error);
      }
    };
    loadVideos();
  }, []);

  const handleDownload = (videoId: string) => {
    setSelectedVideo(videoId);
    setModalVisable(true);
  };
  const handleSelectOption = async (option: "audio" | "video") => {
    if (!selectedVideo) {
      Alert.alert("Error", "No video selected for download.");
      return;
    }

    try {
      const response = await fetch(
        "http://192.168.100.32:5000/downloadvideos",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: selectedVideo, format: option }),
        },
      );

      const data = await response.json();
      if (response.ok) {
        console.log("Download started:", data);
        Alert.alert("Success", `Download started for ${option}.`);
      } else {
        console.error("Backend Error:", data.error);
        Alert.alert(
          "Error",
          data.error || "Failed to initiate download. Please try again.",
        );
      }
    } catch (error) {
      console.error("Download Error:", error);
      Alert.alert("Error", "An error occurred while initiating the download.");
    } finally {
      setModalVisable(false);
    }
  };
  return (
    <View style={[styles.contain, isDarkMode && styles.darkMode]}>
      <View style={styles.toggleContainer}>
        <Image
          source={require("../../assets/images/Original.png")}
          style={{ width: 100, height: 100 }}
        />
        <Switch value={isDarkMode} onValueChange={setisDarkMode} />
      </View>
      <View style={styles.container}>
        <TextInput
          style={styles.Input}
          placeholder="Search Youtube...Paste Link"
          placeholderTextColor="#7d0b02"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity style={styles.button} onPress={handleSearch}>
          <Text style={styles.buttonText}>🔍</Text>
        </TouchableOpacity>
      </View>
      <VideoList
        videos={videos}
        onPlay={(videoUrl) => console.log("Play Video", videoUrl)}
        onDownload={handleDownload}
      />
      <ModalPick
        visable={isModalVisable}
        onClose={() => setModalVisable(false)}
        onSelect={handleSelectOption}
      />
      <TouchableOpacity
        style={styles.toggleButton}
        onPress={() => setVisible(!isVisible)}
      >
        <Text style={styles.toggleButtonText}>
          {isVisible ? "Hide List" : "Show List"}
        </Text>
      </TouchableOpacity>
      <Modal
        visible={isVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.modalContainer}>
          {/* Close Button */}
          <TouchableOpacity
            style={styles.button}
            onPress={() => setVisible(false)}
          >
            <Text style={styles.buttonText}>Close</Text>
          </TouchableOpacity>

          {/* FlatList */}
          <FlatList
            data={downloadVids}
            keyExtractor={(item, index) => index.toString()}
            renderItem={({ item }) => (
              <View style={styles.listItem}>
                {/* Thumbnail */}
                <Image source={{ uri: item.Poster }} style={styles.thumbnail} />
                {/* Title */}
                <Text style={styles.listTitle}>{item.Title}</Text>
                {/* Formats */}
                {Array.isArray(item.Formats) ? (
                  item.Formats.map((format, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.button}
                      onPress={() =>
                        console.log(`Selected Format: ${format.url}`)
                      }
                    >
                      <Text style={styles.listTitle}>
                        Download {format.quality} ({format.size})
                      </Text>
                    </TouchableOpacity>
                  ))
                ) : (
                  <Text style={styles.noFormatsText}>No formats available</Text>
                )}
              </View>
            )}
            contentContainerStyle={styles.listContainer}
          />
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  Input: {
    flex: 1,
    padding: 10,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)", // Semi-transparent background
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 40,
  },
  noFormatsText: {
    backgroundColor: "#7d0b02",
  },
  toggleButton: {
    backgroundColor: "#7d0b02",
    padding: 10,
    borderRadius: 5,
    alignItems: "center",
    marginBottom: 10,
  },
  toggleButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  thumbnail: {
    height: 200,
    width: 200,
    borderRadius: 10,
    marginBottom: 10,
  },
  contain: {
    flex: 1,
    padding: 10,
    borderWidth: 1,
  },
  listContainer: {
    padding: 15,
  },
  listItem: {
    backgroundColor: "#f9f9f9",
    borderRadius: 10,
    padding: 10,
    marginVertical: 10,
    alignItems: "center",
  },
  listTitle: {
    marginTop: 5,
    marginBottom: 5,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    margin: 15,
    borderColor: "#7d0b02",

    borderRadius: 4,
    overflow: "hidden",
  },
  button: {
    backgroundColor: "#7d0b02",
    borderRadius: 5,
    padding: 10,
    marginBottom: 5,
    marginTop: 5,
  },
  buttonText: {
    fontSize: 16,
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
    fontSize: 16,
    color: "#FFF",
  },
});
