import React, { useState, useEffect } from "react";
import { Text, View, TextInput, TouchableOpacity, Image, FlatList, Button, StyleSheet } from "react-native";
import { fetchPopularVids, fetchYouTubeSearchResults } from "../utils/apiService";

type videos = {
  id: string; // Video ID
  snippet: {
    title: string; // Video title
    thumbnails: {
      medium: {
        url: string; // Thumbnail URL
      };
    };
  };
};

export default function Home() {
  const [videos, setVideos] = useState<videos[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery) return;
    setLoading(true);
    try {
      const videos = await fetchYouTubeSearchResults(searchQuery);
      setSearchQuery(videos);
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
        setVideos(popularVids);
      } catch (error) {
        console.log("Failed to load Videos", error);
      }
    };
    loadVideos();
  }, []);

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
      <FlatList
        data={videos}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={{ marginBottom: 20 }}>
            <Image
              source={{ uri: item.snippet.thumbnails.medium.url }}
              style={{ height: 200, width: "100%", borderRadius: 10 }}
            />
            <Text style={{ fontWeight: "bold", marginVertical: 5 }}>{item.snippet.title}</Text>
            <TouchableOpacity
              style={{
                backgroundColor: "#3498db",
                padding: 10,
                marginVertical: 5,
                borderRadius: 5
              }}
              onPress={() => console.log(`Play video: ${item.id}`)}>
              <Text style={{ color: "#fff", textAlign: "center" }}>Stream Video</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                backgroundColor: "#2ecc71",
                padding: 10,
                marginVertical: 5,
                borderRadius: 5
              }}
              onPress={() => console.log(`Download video: ${item.id}`)}>
              <Text style={{ color: "#fff", textAlign: "center" }}>Download Video</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                backgroundColor: "#e74c3c",
                padding: 10,
                marginVertical: 5,
                borderRadius: 5
              }}
              onPress={() => console.log(`Download audio: ${item.id}`)}>
              <Text style={{ color: "#fff", textAlign: "center" }}>Download Audio</Text>
            </TouchableOpacity>
          </View>
        )}
      />
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
