import React, { useEffect, useState, useContext, createContext } from "react";
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  TouchableOpacity,
  Switch,
} from "react-native";
import { DownloadContext } from "./_layout";
import * as Progress from "react-native-progress";
import axios from "axios";

export default function DownloadsScreen() {
  const {
    activeDownloads,
    setActiveDownloads,
    completeDownloads,
    setCompleteDownloads,
  } = useContext(DownloadContext);

  const [downloads, setDownloads] = useState<
    { title: string; progress: number; isComplete: boolean }[]
  >([]);

  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);

  const [videoLink, setVideoLink] = useState<string>("");

  const startDownload = async () => {
    if (!videoLink.trim()) {
      Alert.alert("Error", "Please enter a valid video link.");
      return;
    }

    try {
      setActiveDownloads((prev) => prev + 1);

      // Step 1: Initiate download via backend
      const response = await axios.post("http://localhost:5000/download", {
        url: videoLink,
      });

      const { title, downloadId } = response.data; // Assumes your backend returns `title` and `downloadId`.

      const newDownload = {
        title,
        progress: 0,
        isComplete: false,
      };
      setDownloads((prev) => [...prev, newDownload]);
      setVideoLink(""); // Clear input field

      // Step 2: Poll for progress updates
      const interval = setInterval(async () => {
        try {
          const progressResponse = await axios.get(
            `http://localhost:5000/download-progress`,
            {
              params: { downloadId },
            },
          );

          const { progress, isComplete, path } = progressResponse.data;

          setDownloads((prev) =>
            prev.map((d) =>
              d.title === title ? { ...d, progress, isComplete, path } : d,
            ),
          );

          if (isComplete) {
            clearInterval(interval);
            setActiveDownloads((prev) => prev - 1);
            setCompleteDownloads((prev) => [...prev, title]);
            Alert.alert("Download Complete", `${title} has been downloaded.`);
          }
        } catch (error) {
          console.error("Error fetching progress:", error);
          clearInterval(interval);
        }
      }, 1000); // Poll every second
    } catch (error) {
      console.error("Error starting download:", error);
      Alert.alert(
        "Download Error",
        "Unable to start the download. Please try again.",
      );
      setActiveDownloads((prev) => Math.max(prev - 1, 0));
    }
  };
  return (
    <View style={[styles.container, isDarkMode && styles.darkMode]}>
      <Switch value={isDarkMode} onValueChange={setIsDarkMode} />
      <Text style={styles.title}>Downloads</Text>
      {/* Allow users to paste Links */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Paste Link for Download"
          value={videoLink}
          placeholderTextColor="#7d0b02"
          onChangeText={setVideoLink}
        />
        <TouchableOpacity style={styles.button} onPress={startDownload}>
          <Text>🔍</Text>
        </TouchableOpacity>
      </View>
      {/* Active Download FlatList */}
      <FlatList
        data={downloads}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item }) => (
          <View style={styles.download}>
            <Text style={styles.itemTitle}>
              {item.title} - {item.isComplete ? "Complete" : "Downloading.."}
            </Text>
            {item.isComplete && (
              <Progress.Bar
                progress={item.progress}
                width={null}
                height={10}
                color="#7d0b02"
                borderRadius={5}
              />
            )}
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.noDownloads}>No Active Downloads</Text>
        }
      />
      <Text style={styles.subtitle}>Complete Downloads</Text>
      <FlatList
        data={completeDownloads}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item }) => <Text style={styles.itemTitle}>{item}</Text>}
        ListEmptyComponent={
          <Text style={styles.noDownloads}>No completed downloads</Text>
        }
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
    color: "#7d0b02",
  },
  subtitle: {
    fontSize: 16,
    marginTop: 20,
    fontWeight: "bold",
    color: "#7d0b02",
  },
  downloadItem: { marginBottom: 15 },
  itemTitle: { fontSize: 16, marginBottom: 5 },
  item: { fontSize: 16, marginBottom: 5 },
  noDownloads: { fontSize: 14, fontStyle: "italic", color: "#999" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#7d0b02",
    borderRadius: 5,
    padding: 10,
    marginRight: 10,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  button: {
    backgroundColor: "#7d0b02",
    borderRadius: 5,
    padding: 10,
  },
  download: {
    marginBottom: 10,
  },
  darkMode: {
    backgroundColor: "#121212",
  },
});
