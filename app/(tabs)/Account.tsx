import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  TextInput,
  Switch,
  RefreshControl,
  ToastAndroid // for Android notifications (optional)
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import axios from "axios";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { Buffer } from "buffer";
import Constants from "expo-constants";
import * as Progress from "react-native-progress";

// Define your DownloadRecord type.
export type DownloadRecord = {
  id: string;
  title: string;
  Poster: string;
  fileUri: string; // local file path
  type: "video" | "audio" | string;
  thumbnail?: string;
  source: "torrent" | "direct";
  Formats?: string[];
  downloadedAt?: number;
};

export default function DownloadsScreen() {
  const [downloadRecords, setDownloadRecords] = useState<DownloadRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  // Track active download progress (0 to 100) by record id.
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);

  const DOWNLOADER_API = Constants.expoConfig?.extra?.API_Backend;

  // Load persisted downloads from AsyncStorage.
  const loadDownloads = async () => {
    try {
      const recordsStr = await AsyncStorage.getItem("downloadedFiles");
      let records: DownloadRecord[] = recordsStr ? JSON.parse(recordsStr) : [];
      // Sort downloads by downloadedAt descending (newest first)
      records.sort((a, b) => (b.downloadedAt || 0) - (a.downloadedAt || 0));
      setDownloadRecords(records);
    } catch (err) {
      console.error("Error loading downloads", err);
      Alert.alert("Error", "Failed to load downloads.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadDownloads();
    }, [])
  );

  // Pull-to-refresh handler.
  const onRefresh = () => {
    setRefreshing(true);
    loadDownloads();
  };

  // Open the downloaded file using Linking.
  const openFile = async (fileUri: string) => {
    try {
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (!fileInfo.exists) {
        Alert.alert("Error", "File does not exist.");
        return;
      }
      const supported = await Linking.canOpenURL(fileUri);
      if (supported) {
        await Linking.openURL(fileUri);
      } else {
        Alert.alert("Error", "No application available to open this file.");
      }
    } catch (error) {
      console.error("Error opening file", error);
      Alert.alert("Error", "Unable to open file.");
    }
  };

  // Remove a download record.
  const removeDownloadRecord = async (id: string) => {
    try {
      const updatedRecords = downloadRecords.filter(record => record.id !== id);
      await AsyncStorage.setItem("downloadedFiles", JSON.stringify(updatedRecords));
      setDownloadRecords(updatedRecords);
    } catch (error) {
      console.error("Error removing download record:", error);
      Alert.alert("Error", "Failed to remove download record.");
    }
  };

  // Share a download record (triggered on long press).
  const shareDownload = async (fileUri: string) => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert("Error", "Sharing is not available on this device.");
      }
    } catch (error) {
      console.error("Error sharing file", error);
      Alert.alert("Error", "Unable to share file.");
    }
  };

  // Render each download record item.
  const renderDownloadItem = ({ item }: { item: DownloadRecord }) => {
    const progress = downloadProgress[item.id];
    return (
      <TouchableOpacity
        style={styles.downloadItem}
        onPress={() => openFile(item.fileUri)}
        onLongPress={() => shareDownload(item.fileUri)}>
        {item.thumbnail || item.Poster ? (
          <Image source={{ uri: item.thumbnail || item.Poster }} style={styles.thumbnail} />
        ) : (
          <View style={[styles.thumbnail, styles.placeholderThumbnail]}>
            <Text style={styles.placeholderText}>No Image</Text>
          </View>
        )}
        <View style={styles.downloadInfo}>
          <Text style={styles.downloadTitle}>{item.title}</Text>
          <Text style={styles.downloadType}>{item.type.toUpperCase()}</Text>
          {progress !== undefined && progress < 100 && (
            <View style={styles.progressContainer}>
              <Progress.Bar progress={progress / 100} width={null} height={10} color="#7d0b02" borderRadius={5} />
              <Text style={styles.progressText}>{progress}%</Text>
            </View>
          )}
          {progress === 100 && <Text style={styles.downloadComplete}>Complete</Text>}
        </View>
        <TouchableOpacity style={styles.removeButton} onPress={() => removeDownloadRecord(item.id)}>
          <Text style={styles.removeButtonText}>Remove</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, isDarkMode && styles.darkMode]}>
      <View style={styles.headerContainer}>
        <Text style={styles.title}>My Downloads</Text>
        <TouchableOpacity
          style={styles.clearButton}
          onPress={async () => {
            Alert.alert("Clear Downloads", "Are you sure you want to remove all downloads?", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Yes",
                onPress: async () => {
                  await AsyncStorage.removeItem("downloadedFiles");
                  setDownloadRecords([]);
                  ToastAndroid.show("Downloads cleared", ToastAndroid.SHORT);
                }
              }
            ]);
          }}>
          <Text style={styles.clearButtonText}>Clear All</Text>
        </TouchableOpacity>
        <Switch value={isDarkMode} onValueChange={setIsDarkMode} />
      </View>
      {loading ? (
        <ActivityIndicator size="large" color="#555" />
      ) : (
        <FlatList
          data={downloadRecords}
          keyExtractor={item => item.id}
          renderItem={renderDownloadItem}
          ListEmptyComponent={<Text style={styles.noDownloads}>No downloads found.</Text>}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f5f5f5" },
  darkMode: { backgroundColor: "#121212" },
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 15
  },
  title: { fontSize: 20, fontWeight: "bold", color: "#7d0b02" },
  clearButton: {
    backgroundColor: "#FF5722",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5
  },
  clearButtonText: { color: "#fff", fontSize: 14 },
  downloadItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E1E1E",
    padding: 10,
    borderRadius: 10,
    marginVertical: 8
  },
  thumbnail: { width: 80, height: 80, borderRadius: 5, marginRight: 10 },
  placeholderThumbnail: {
    backgroundColor: "#ccc",
    justifyContent: "center",
    alignItems: "center"
  },
  placeholderText: { fontSize: 10, color: "#333" },
  downloadInfo: { flex: 1 },
  downloadTitle: { fontSize: 16, fontWeight: "bold", color: "#fff" },
  downloadType: { fontSize: 14, color: "#bbb" },
  progressContainer: { marginTop: 5 },
  progressText: { fontSize: 12, color: "#7d0b02", marginTop: 2 },
  downloadComplete: { fontSize: 12, color: "green", marginTop: 5 },
  noDownloads: { textAlign: "center", color: "#999", fontStyle: "italic" },
  removeButton: { backgroundColor: "#FF5722", padding: 5, borderRadius: 5 },
  removeButtonText: { color: "#fff", fontSize: 12 }
});
