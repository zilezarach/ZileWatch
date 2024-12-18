import React, { useState, useEffect } from "react";
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Image,
  FlatList,
  Button,
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

export default function Home({ navigation }: any) {
  const [videos, setVideos] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [isModalVisable, setModalVisable] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState("");
  const [isDarkMode, setisDarkMode] = useState<boolean>(true);

  const handleSearch = async () => {
    if (!searchQuery) return;
    setLoading(true);
    try {
      const results = await fetchYouTubeSearchResults(searchQuery);
      setVideos(results || []);
    } catch (error) {
      console.log("Error Fetching Videos", error);
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
    </View>
  );
}
const styles = StyleSheet.create({
  Input: {
    flex: 1,
    padding: 10,
  },
  contain: {
    flex: 1,
    padding: 10,
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
