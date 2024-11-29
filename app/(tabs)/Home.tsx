import React, { useState, useEffect } from "react";
import { Text, View, TextInput, TouchableOpacity, Image, FlatList, Button, StyleSheet } from "react-native";
import { fetchPopularVids, fetchYouTubeSearchResults } from "@/utils/apiService";
import VideoList from "@/components/videoList";
import ModalPick from "@/components/DownloadPrompt";

export default function Home({ navigation }: any) {
  const [videos, setVideos] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [isModalVisable, setModalVisable] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState("");

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

  const handleSelectOption = (option: "audio" | "video") => {
    console.log("Downloading ${option} for video ID: ${selectedVideo}");
    setModalVisable(false);
  };

  return (
    <View style={{ flex: 1, padding: 10 }}>
      <View style={styles.container}>
        <TextInput
          style={styles.Input}
          placeholder="Search Youtube...Paste Link"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <TouchableOpacity style={styles.button} onPress={handleSearch}>
          <Text style={styles.buttonText}>🔍</Text>
        </TouchableOpacity>
      </View>
      <VideoList videos={videos} onPlay={videoUrl => console.log("Play Video", videoUrl)} onDownload={handleDownload} />
      <ModalPick visable={isModalVisable} onClose={() => setModalVisable(false)} onSelect={handleSelectOption} />
    </View>
  );
}
const styles = StyleSheet.create({
  Input: {
    flex: 1,
    padding: 10
  },

  container: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    margin: 15,
    borderColor: "#7d0b02",

    borderRadius: 4,
    overflow: "hidden"
  },
  button: {
    backgroundColor: "#7d0b02",
    borderRadius: 5,
    padding: 10
  },
  buttonText: {
    fontSize: 16
  }
});
