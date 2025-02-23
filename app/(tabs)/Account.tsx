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
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import axios from "axios";
import * as FileSystem from "expo-file-system";
import { Buffer } from "buffer";

type DownloadRecord = {
  id: string;
  title: string;
  Poster: string;
  fileUri: string; // Where the file is saved
  type: string; // "video", "audio", "torrent", "direct", etc.
  thumbnail?: string;
  source: "torrent" | "direct"; // Source type for the download
  Formats?: string[]; // Available formats if applicable
};

export default function DownloadsScreen() {
  const [downloadRecords, setDownloadRecords] = useState<DownloadRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  // downloadProgress: key: `${record.id}_${format}`, value: percentage (0-100)
  const [downloadProgress, setDownloadProgress] = useState<
    Record<string, number>
  >({});

  // Load persisted downloads from AsyncStorage.
  const loadDownloads = async () => {
    try {
      const recordsStr = await AsyncStorage.getItem("downloadedFiles");
      if (recordsStr) {
        setDownloadRecords(JSON.parse(recordsStr));
      } else {
        setDownloadRecords([]);
      }
    } catch (err) {
      console.error("Error loading downloads", err);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadDownloads();
    }, [])
  );

  // Open the downloaded file using Linking so the native app opens it.
  const openFile = async (fileUri: string) => {
    try {
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

  // Generic download handler that tracks progress.
  // This function accepts a download record and a format option.
  // It supports both torrent downloads and direct downloads.
  const handleDownloadLink = async (record: DownloadRecord, format: string) => {
    const key = `${record.id}_${format}`;
    try {
      // Reset progress.
      setDownloadProgress((prev) => ({ ...prev, [key]: 0 }));

      // Choose the download endpoint based on the record's source.
      // Replace "YOUR_DOWNLOADER_API" with your backend API URL.
      let url = "";
      if (record.source === "torrent") {
        url = `${"https://api.0xzile.sbs"}/download-torrents`;
      } else {
        // For direct downloads.
        url = `${"https://api.0xzile.sbs"}/download-videos`;
      }

      // Perform the download using axios with onDownloadProgress.
      const response = await axios.get(url, {
        params:
          record.source === "torrent"
            ? { magnet: record.id, format } // or however your backend expects torrent downloads
            : { url: record.fileUri, format },
        responseType: "arraybuffer",
        onDownloadProgress: (progressEvent) => {
          const total = progressEvent.total || 1;
          const progress = Math.round((progressEvent.loaded / total) * 100);
          setDownloadProgress((prev) => ({ ...prev, [key]: progress }));
        },
      });

      // Define download folder.
      const downloadDir = `${FileSystem.documentDirectory}Downloads/`;
      const directoryInfo = await FileSystem.getInfoAsync(downloadDir);
      if (!directoryInfo.exists) {
        await FileSystem.makeDirectoryAsync(downloadDir, {
          intermediates: true,
        });
      }

      // Determine file extension based on record type.
      const fileExtension = record.type === "audio" ? "m4a" : "mp4";
      // Sanitize title to form a file name.
      const fileName = `${record.title.replace(/\s+/g, "_")}.${fileExtension}`;
      const fileUri = `${downloadDir}${fileName}`;

      // Convert response data to base64 and save the file.
      const base64Data = Buffer.from(response.data).toString("base64");
      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // For now, we simply update AsyncStorage and state.
      // Remove the downloaded record from our list.
      setDownloadRecords((prev) =>
        prev.filter((item) => item.id !== record.id)
      );
      // Remove progress tracking for this download.
      setDownloadProgress((prev) => {
        const { [key]: removed, ...rest } = prev;
        return rest;
      });
      Alert.alert(
        "Download Complete",
        `Downloaded: ${record.title} in ${format} format.`
      );
    } catch (error) {
      console.error("Download error", error);
      Alert.alert("Error", "Download failed. Please try again.");
      setDownloadProgress((prev) => ({ ...prev, [key]: 0 }));
    }
  };

  // Render item for the download options modal.
  // For simplicity, assume each record has a Formats array with available formats.
  const renderModalItem = ({ item }: { item: DownloadRecord }) => (
    <View style={styles.listItem}>
      <Image
        source={{ uri: item.Poster || item.thumbnail }}
        style={styles.thumbnail}
      />
      <Text style={styles.listTitle}>{item.title}</Text>
      {Array.isArray(item.Formats) ? (
        item.Formats.map((format, index) => {
          const key = `${item.id}_${format}`;
          const progress = downloadProgress[key] || 0;
          return (
            <View key={index} style={styles.downloadOption}>
              <TouchableOpacity
                style={[
                  styles.button,
                  progress > 0 && progress < 100 && styles.buttonDisabled,
                ]}
                onPress={() => handleDownloadLink(item, format)}
                disabled={progress > 0 && progress < 100}
              >
                <Text style={styles.buttonText}>
                  {progress > 0 && progress < 100
                    ? `Downloading... ${progress}%`
                    : `Download ${format}`}
                </Text>
              </TouchableOpacity>
              {progress === 0 && (
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => handleDownloadLink(item, format)}
                >
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })
      ) : (
        <Text style={styles.noFormatsText}>No formats available</Text>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Downloads</Text>
      {loading ? (
        <ActivityIndicator size="large" color="#555" />
      ) : (
        <FlatList
          data={downloadRecords}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.downloadItem}
              onPress={() => openFile(item.fileUri)}
            >
              {item.thumbnail ? (
                <Image
                  source={{ uri: item.thumbnail }}
                  style={styles.thumbnail}
                />
              ) : (
                <View style={[styles.thumbnail, styles.placeholderThumbnail]}>
                  <Text style={styles.placeholderText}>No Image</Text>
                </View>
              )}
              <View style={styles.downloadInfo}>
                <Text style={styles.downloadTitle}>{item.title}</Text>
                <Text style={styles.downloadType}>
                  {item.type.toUpperCase()}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.noDownloads}>No downloads found.</Text>
          }
        />
      )}

      {/* Modal for download options */}
      <Modal
        visible={false} // Adjust: show this modal when user selects a record for downloading additional formats.
        animationType="slide"
        transparent
        onRequestClose={() => {}}
      >
        <View style={styles.Modalcontain}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              // Close modal logic here.
            }}
          >
            <Text style={styles.buttonText}>Close</Text>
          </TouchableOpacity>
          <FlatList
            data={[] /* set to selected record(s) if needed */}
            keyExtractor={(item, index) => index.toString()}
            renderItem={renderModalItem}
            contentContainerStyle={styles.listContainer}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f5f5f5" },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 15,
    color: "#7d0b02",
  },
  listTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#7d0b02",
  },
  listItem: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  downloadItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E1E1E",
    padding: 10,
    borderRadius: 10,
    marginVertical: 8,
  },
  thumbnail: { width: 80, height: 80, borderRadius: 5, marginRight: 10 },
  placeholderThumbnail: {
    backgroundColor: "#ccc",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: { fontSize: 10, color: "#333" },
  downloadInfo: { flex: 1 },
  downloadTitle: { fontSize: 16, fontWeight: "bold", color: "#fff" },
  downloadType: { fontSize: 14, color: "#bbb" },
  downloadOption: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 5,
  },
  button: {
    backgroundColor: "#FF5722",
    borderRadius: 10,
    padding: 10,
    marginRight: 10,
  },
  buttonDisabled: { backgroundColor: "#aaa" },
  buttonText: { color: "#FFF" },
  retryButton: { backgroundColor: "#7d0b02", borderRadius: 10, padding: 10 },
  retryText: { color: "#FFF", fontSize: 14 },
  noFormatsText: { color: "#bbb", fontSize: 14, textAlign: "center" },
  noDownloads: { textAlign: "center", color: "#999", fontStyle: "italic" },
  Modalcontain: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 40,
  },
  listContainer: { padding: 20 },
});
