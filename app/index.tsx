import React, { useState, useEffect } from "react";
import { Text, View, TextInput, TouchableOpacity, Image, FlatList } from "react-native";
import { fetchPopularVids } from "../utils/apiService";

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
  const [search, setSearch] = useState("");

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
      <TextInput
        placeholder="Search for videos..."
        value={search}
        onChangeText={setSearch}
        style={{
          borderWidth: 1,
          borderColor: "gray",
          borderRadius: 10,
          padding: 10,
          marginBottom: 10
        }}
      />
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
