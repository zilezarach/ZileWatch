import React, { useEffect, useState, useContext } from "react";
import { View, TextInput, Text, StyleSheet, FlatList, Alert, TouchableOpacity, Switch } from "react-native";
import { DownloadContext } from "./_layout";
import * as Progress from "react-native-progress";
import axios from "axios";

// Type definition for Video (if needed)
type Video = {
  Title: string;
  Plot: string;
  Formats: string[];
  Poster: string;
};

export default function DownloadsScreen() {
  const { activeDownloads, setActiveDownloads, completeDownloads, setCompleteDownloads } = useContext(DownloadContext);

  const [downloads, setDownloads] = useState<{ title: string; progress: number; isComplete: boolean }[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [videoLink, setVideoLink] = useState<string>("");
  const [downloadsVids, setDownloadVids] = useState<Video[]>();
  const [loading, setLoading] = useState(true);

  // Update local downloads state from the shared activeDownloads context.
  useEffect(() => {
    const downloadsArray = Object.values(activeDownloads).map(download => ({
      title: download.title,
      progress: download.progress, // progress is a fraction (0 to 1)
      isComplete: download.progress === 1
    }));
    setDownloads(downloadsArray);
  }, [activeDownloads]);

  const handleLinks = async () => {
    if (!searchQuery) return;
    const isURL = searchQuery.startsWith("http://") || searchQuery.startsWith("https://");
    if (!isURL) {
      await fetchLinks(searchQuery);
    }
    setLoading(false);
  };

  const fetchLinks = async (url: string) => {
    try {
      setLoading(true);
      const res = await axios.get("http://10.0.2.2:5000/download-videos", {
        params: { url }
      });
      const formatsArray = Array.isArray(res.data.formats) ? res.data.formats : Object.keys(res.data.formats);

      // Create a new download entry (this example simulates the download)
      const newDownload = {
        title: res.data.title,
        progress: 0,
        isComplete: false
      };
      setDownloads(prev => [...prev, newDownload]);

      // Simulate progress updates for demonstration purposes.
      let progress = 0;
      const interval = setInterval(() => {
        if (progress >= 1) {
          clearInterval(interval);
          newDownload.isComplete = true;
          setDownloads(prev => prev.map(d => (d.title === newDownload.title ? newDownload : d)));
        } else {
          progress += 0.1;
          setDownloads(prev => prev.map(d => (d.title === newDownload.title ? { ...d, progress } : d)));
        }
      }, 1000);
    } catch (error) {
      console.error("Error Fetching Videos", error);
      Alert.alert("Error", "Unable to Fetch Data from Url");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, isDarkMode && styles.darkMode]}>
      <Switch value={isDarkMode} onValueChange={setIsDarkMode} />
      <Text style={styles.title}>Downloads</Text>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Paste Link for Download"
          value={videoLink}
          placeholderTextColor="#7d0b02"
          onChangeText={setVideoLink}
        />
        <TouchableOpacity style={styles.button} onPress={handleLinks}>
          <Text>🔍</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={downloads}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item }) => (
          <View style={styles.download}>
            <Text style={styles.itemTitle}>
              {item.title} - {item.isComplete ? "Complete" : "Downloading..."}
            </Text>
            {item.isComplete ? (
              <Text>Download Complete</Text>
            ) : (
              <Progress.Bar progress={item.progress} width={null} height={10} color="#7d0b02" borderRadius={5} />
            )}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.noDownloads}>No Active Downloads</Text>}
      />
      <Text style={styles.subtitle}>Complete Downloads</Text>
      <FlatList
        data={completeDownloads}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item }) => <Text style={styles.itemTitle}>{item.title}</Text>}
        ListEmptyComponent={<Text style={styles.noDownloads}>No completed downloads</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f5f5f5" },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#7d0b02"
  },
  subtitle: {
    fontSize: 16,
    marginTop: 20,
    fontWeight: "bold",
    color: "#7d0b02"
  },
  itemTitle: { fontSize: 16, marginBottom: 5 },
  noDownloads: { fontSize: 14, fontStyle: "italic", color: "#999" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#7d0b02",
    borderRadius: 5,
    padding: 10,
    marginRight: 10
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20
  },
  button: {
    backgroundColor: "#7d0b02",
    borderRadius: 5,
    padding: 10
  },
  download: { marginBottom: 10 },
  darkMode: { backgroundColor: "#121212" }
});
