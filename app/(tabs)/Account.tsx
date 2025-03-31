import React, { useState, useCallback, useContext } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  RefreshControl,
  ToastAndroid,
  Switch,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import * as Linking from "expo-linking";
import * as Progress from "react-native-progress";
import { DownloadContext } from "./_layout";

// Define DownloadRecord type (aligned with Home)
export type DownloadRecord = {
  id: string;
  title: string;
  Poster: string;
  fileUri: string;
  type: "audio" | "video";
  source: "direct" | "torrent";
  downloadedAt: number;
};

export default function DownloadsScreen() {
  const [downloadRecords, setDownloadRecords] = useState<DownloadRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const { activeDownloads, completeDownloads } = useContext(DownloadContext); // Integrate DownloadContext

  // Load persisted downloads from AsyncStorage
  const loadDownloads = async () => {
    try {
      const recordsStr = await AsyncStorage.getItem("downloadedFiles");
      let records: DownloadRecord[] = recordsStr ? JSON.parse(recordsStr) : [];
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

  const onRefresh = () => {
    setRefreshing(true);
    loadDownloads();
  };

  // Open the downloaded fileUri
  const openFile = async (fileUri: string, fileType: string) => {
    try {
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (!fileInfo.exists) {
        Alert.alert("Error", "File not found or may have been deleted.");
        return;
      }

      console.log("Opening file URI:", fileUri, "of type:", fileType);

      // For Android, we need special handling for media files
      if (Platform.OS === "android") {
        // First, try to save to MediaLibrary for media files
        if (fileType === "audio" || fileType === "video") {
          try {
            // Make sure the file is saved to the MediaLibrary
            await MediaLibrary.createAssetAsync(fileUri);

            // Use content URI with the appropriate MIME type
            const contentUri = await FileSystem.getContentUriAsync(fileUri);
            const mimeType = getMimeType(fileUri);

            // Use Intent to open the file with the default app
            await Linking.openURL(contentUri);
            return;
          } catch (mediaError) {
            console.log("MediaLibrary error:", mediaError);
            // Fall through to other methods if this fails
          }
        }

        // Alternate approach: Try to open with content URI
        try {
          const contentUri = await FileSystem.getContentUriAsync(fileUri);
          await Linking.openURL(contentUri);
          return;
        } catch (contentError) {
          console.error("Error opening with content URI:", contentError);
        }

        // Fallback to sharing if direct opening fails
        if (await Sharing.isAvailableAsync()) {
          const mimeType = getMimeType(fileUri);
          await Sharing.shareAsync(fileUri, { mimeType });
          return;
        }
      }
      // iOS handling
      else if (Platform.OS === "ios") {
        // Try direct opening first for iOS
        try {
          const canOpen = await Linking.canOpenURL(fileUri);
          if (canOpen) {
            await Linking.openURL(fileUri);
            return;
          }
        } catch (error) {
          console.log("iOS direct open error:", error);
        }

        // Fall back to sharing
        if (await Sharing.isAvailableAsync()) {
          const mimeType = getMimeType(fileUri);
          // Note: Removed the 'uti' property as it's not supported
          await Sharing.shareAsync(fileUri, { mimeType });
          return;
        }
      }

      Alert.alert("Error", "No app found to open this file.");
    } catch (error) {
      console.error("Error opening file:", error);
      Alert.alert("Error", "Unable to open the file: ");
    }
  };
  //get Mime mimeType
  const getMimeType = (fileUri: string) => {
    const extension = fileUri.split(".").pop()?.toLowerCase();

    // Video formats
    if (extension === "mp4") return "video/mp4";
    if (extension === "mov") return "video/quicktime";
    if (extension === "avi") return "video/x-msvideo";
    if (extension === "mkv") return "video/x-matroska";

    // Audio formats
    if (extension === "mp3") return "audio/mpeg";
    if (extension === "m4a") return "audio/m4a";
    if (extension === "aac") return "audio/aac";
    if (extension === "wav") return "audio/wav";
    if (extension === "ogg") return "audio/ogg";
    if (extension === "flac") return "audio/flac";

    return "application/octet-stream"; // Fallback
  };
  // Remove a download record and optionally delete the file
  const removeDownloadRecord = async (id: string, fileUri: string) => {
    Alert.alert(
      "Remove Download",
      "Do you want to delete the file from your device as well?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove Record Only",
          onPress: async () => {
            try {
              const updatedRecords = downloadRecords.filter(
                (record) => record.id !== id
              );
              await AsyncStorage.setItem(
                "downloadedFiles",
                JSON.stringify(updatedRecords)
              );
              setDownloadRecords(updatedRecords);
              ToastAndroid.show("Download record removed", ToastAndroid.SHORT);
            } catch (error) {
              console.error("Error removing download record:", error);
              Alert.alert("Error", "Failed to remove download record.");
            }
          },
        },
        {
          text: "Delete File",
          onPress: async () => {
            try {
              const fileInfo = await FileSystem.getInfoAsync(fileUri);
              if (fileInfo.exists) {
                await FileSystem.deleteAsync(fileUri);
                // Remove from MediaLibrary if it’s in the gallery
                const asset = await MediaLibrary.getAssetInfoAsync(fileUri);
                if (asset) {
                  await MediaLibrary.deleteAssetsAsync([asset]);
                }
              }
              const updatedRecords = downloadRecords.filter(
                (record) => record.id !== id
              );
              await AsyncStorage.setItem(
                "downloadedFiles",
                JSON.stringify(updatedRecords)
              );
              setDownloadRecords(updatedRecords);
              ToastAndroid.show(
                "Download and file removed",
                ToastAndroid.SHORT
              );
            } catch (error) {
              console.error("Error deleting file and record:", error);
              Alert.alert("Error", "Failed to delete file and record.");
            }
          },
        },
      ]
    );
  };

  // Share a download
  const shareDownload = async (fileUri: string) => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert("Error", "Sharing is not available on this device.");
      }
    } catch (error) {
      console.error("Error sharing file:", error);
      Alert.alert("Error", "Unable to share file.");
    }
  };

  // Render download item
  const renderDownloadItem = ({ item }: { item: DownloadRecord }) => {
    const progress = activeDownloads[item.id]?.progress; // Get progress from context
    return (
      <TouchableOpacity
        style={styles.downloadItem}
        onPress={() => openFile(item.fileUri, item.type)}
        onLongPress={() => shareDownload(item.fileUri)}
      >
        {item.Poster ? (
          <Image source={{ uri: item.Poster }} style={styles.thumbnail} />
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
              <Progress.Bar
                progress={progress / 100}
                width={null}
                height={10}
                color="#7d0b02"
                borderRadius={5}
              />
              <Text style={styles.progressText}>{progress}%</Text>
            </View>
          )}
          {(!progress || progress === 100) && (
            <Text style={styles.downloadComplete}>Complete</Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => removeDownloadRecord(item.id, item.fileUri)}
        >
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
            Alert.alert(
              "Clear Downloads",
              "Are you sure you want to remove all downloads?",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Yes",
                  onPress: async () => {
                    try {
                      for (const record of downloadRecords) {
                        const fileInfo = await FileSystem.getInfoAsync(
                          record.fileUri
                        );
                        if (fileInfo.exists) {
                          await FileSystem.deleteAsync(record.fileUri);
                        }
                      }
                      await AsyncStorage.removeItem("downloadedFiles");
                      setDownloadRecords([]);
                      ToastAndroid.show(
                        "Downloads cleared",
                        ToastAndroid.SHORT
                      );
                    } catch (error) {
                      console.error("Error clearing downloads:", error);
                      Alert.alert("Error", "Failed to clear downloads.");
                    }
                  },
                },
              ]
            );
          }}
        >
          <Text style={styles.clearButtonText}>Clear All</Text>
        </TouchableOpacity>
        <Switch value={isDarkMode} onValueChange={setIsDarkMode} />
      </View>
      {loading ? (
        <ActivityIndicator size="large" color="#555" />
      ) : (
        <FlatList
          data={downloadRecords}
          keyExtractor={(item) => item.id}
          renderItem={renderDownloadItem}
          ListEmptyComponent={
            <Text style={styles.noDownloads}>No downloads found.</Text>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
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
    marginBottom: 15,
  },
  title: { fontSize: 20, fontWeight: "bold", color: "#7d0b02" },
  clearButton: {
    backgroundColor: "#FF5722",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  clearButtonText: { color: "#fff", fontSize: 14 },
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
  progressContainer: { marginTop: 5 },
  progressText: { fontSize: 12, color: "#7d0b02", marginTop: 2 },
  downloadComplete: { fontSize: 12, color: "green", marginTop: 5 },
  noDownloads: { textAlign: "center", color: "#999", fontStyle: "italic" },
  removeButton: { backgroundColor: "#FF5722", padding: 5, borderRadius: 5 },
  removeButtonText: { color: "#fff", fontSize: 12 },
});
