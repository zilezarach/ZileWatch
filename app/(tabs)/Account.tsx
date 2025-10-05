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
  progress?: number;
  downloadedAt: number;
};

export default function DownloadsScreen() {
  const [downloadRecords, setDownloadRecords] = useState<DownloadRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const { activeDownloads, completeDownloads } = useContext(DownloadContext);
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
    }, []),
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadDownloads();
  };

  // Helper: Check permissions
  const ensurePermissions = async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Required",
        "Media access is needed to open files.",
      );
      return false;
    }
    return true;
  };

  // Helper: Verify file existence based on URI type
  const verifyFileExists = async (fileUri: string): Promise<boolean> => {
    try {
      if (fileUri.startsWith("content://")) {
        // MediaLibrary URI: Check via asset info
        const assetInfo = await MediaLibrary.getAssetInfoAsync(fileUri);
        return !!assetInfo.localUri || !!assetInfo.uri;
      } else {
        // file:// or path: Use FileSystem
        const fileInfo = await FileSystem.getInfoAsync(fileUri);
        return fileInfo.exists;
      }
    } catch (error) {
      console.error("Error verifying file:", error);
      return false;
    }
  };

  // Open the downloaded fileUri
  const openFile = async (fileUri: string, fileType: string) => {
    try {
      // Ensure permissions
      if (!(await ensurePermissions())) return;

      console.log("Opening file URI:", fileUri, "of type:", fileType);

      // Verify existence first
      if (!(await verifyFileExists(fileUri))) {
        Alert.alert("Error", "File not found or may have been deleted.");
        return;
      }

      let uriToOpen = fileUri;

      // For Android content://, try direct Linking first
      if (Platform.OS === "android" && fileUri.startsWith("content://")) {
        try {
          await Linking.openURL(fileUri);
          if (Platform.OS === "android") {
            ToastAndroid.show("Opening file...", ToastAndroid.SHORT);
          }
          return;
        } catch (linkError) {
          console.error("Direct Linking failed:", linkError);
          // Fallback: Copy to cache for reliable access
          const cacheUri = `${FileSystem.cacheDirectory}temp_open_${Date.now()}.${fileType === "video" ? "mp4" : "m4a"}`;
          await FileSystem.copyAsync({ from: fileUri, to: cacheUri });
          uriToOpen = `file://${cacheUri}`;
        }
      }

      // General opening: Try Linking
      const canOpen = await Linking.canOpenURL(uriToOpen);
      if (canOpen) {
        await Linking.openURL(uriToOpen);
        if (Platform.OS === "android") {
          ToastAndroid.show("Opening file...", ToastAndroid.SHORT);
        }
        return;
      }

      // Fallback to sharing
      if (await Sharing.isAvailableAsync()) {
        const mimeType = getMimeType(fileUri);
        await Sharing.shareAsync(uriToOpen, { mimeType });
        return;
      }

      Alert.alert("Error", "No app found to open this file.");
    } catch (error: any) {
      console.error("Error opening file:", error);
      Alert.alert("Error", `Unable to open the file: ${error.message}`);
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
    if (extension === "m4a") return "audio/mp4";
    if (extension === "aac") return "audio/aac";
    if (extension === "wav") return "audio/wav";
    if (extension === "ogg") return "audio/ogg";
    if (extension === "flac") return "audio/flac";

    return "application/octet-stream"; // Fallback
  };

  // Helper: Delete file based on URI type
  const deleteFile = async (fileUri: string): Promise<boolean> => {
    try {
      if (fileUri.startsWith("content://")) {
        // MediaLibrary URI: Delete via asset
        const asset = await MediaLibrary.getAssetInfoAsync(fileUri);
        if (asset) {
          await MediaLibrary.deleteAssetsAsync([asset]);
          return true;
        }
      } else {
        // file://: Use FileSystem
        await FileSystem.deleteAsync(fileUri);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error deleting file:", error);
      return false;
    }
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
                (record) => record.id !== id,
              );
              await AsyncStorage.setItem(
                "downloadedFiles",
                JSON.stringify(updatedRecords),
              );
              setDownloadRecords(updatedRecords);
              if (Platform.OS === "android") {
                ToastAndroid.show(
                  "Download record removed",
                  ToastAndroid.SHORT,
                );
              }
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
              const deleted = await deleteFile(fileUri);
              const updatedRecords = downloadRecords.filter(
                (record) => record.id !== id,
              );
              await AsyncStorage.setItem(
                "downloadedFiles",
                JSON.stringify(updatedRecords),
              );
              setDownloadRecords(updatedRecords);
              if (Platform.OS === "android") {
                ToastAndroid.show(
                  deleted
                    ? "Download and file removed"
                    : "Download record removed (file not found)",
                  ToastAndroid.SHORT,
                );
              }
            } catch (error) {
              console.error("Error deleting file and record:", error);
              Alert.alert("Error", "Failed to delete file and record.");
            }
          },
        },
      ],
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
    // ✅ Use active progress if downloading, else fallback to persisted or 100
    const progress = activeDownloads[item.id]?.progress ?? item.progress ?? 100;
    return (
      <TouchableOpacity
        style={styles.downloadItem}
        onPress={() => openFile(item.fileUri, item.type)}
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

          {/* ✅ Always show a progress bar */}
          <View style={styles.progressContainer}>
            <Progress.Bar
              progress={Math.min(progress / 100, 1)} // Clamp to 0-1
              width={null}
              height={10}
              color={progress < 100 ? "#7d0b02" : "green"}
              unfilledColor="#333"
              borderRadius={5}
            />
            {progress < 100 ? (
              <Text style={styles.progressText}>{Math.round(progress)}%</Text>
            ) : (
              <Text style={styles.downloadComplete}>Complete</Text>
            )}
          </View>
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
        <Text style={[styles.title, isDarkMode && styles.darkTitle]}>
          My Downloads
        </Text>
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
                        await deleteFile(record.fileUri);
                      }
                      await AsyncStorage.removeItem("downloadedFiles");
                      setDownloadRecords([]);
                      if (Platform.OS === "android") {
                        ToastAndroid.show(
                          "Downloads cleared",
                          ToastAndroid.SHORT,
                        );
                      }
                    } catch (error) {
                      console.error("Error clearing downloads:", error);
                      Alert.alert("Error", "Failed to clear downloads.");
                    }
                  },
                },
              ],
            );
          }}
        >
          <Text style={styles.clearButtonText}>Clear All</Text>
        </TouchableOpacity>
        <Switch value={isDarkMode} onValueChange={setIsDarkMode} />
      </View>
      {loading ? (
        <ActivityIndicator size="large" color={isDarkMode ? "#fff" : "#555"} />
      ) : (
        <FlatList
          data={downloadRecords}
          keyExtractor={(item) => item.id}
          renderItem={renderDownloadItem}
          ListEmptyComponent={
            <Text
              style={[styles.noDownloads, isDarkMode && styles.darkNoDownloads]}
            >
              No downloads found.
            </Text>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={isDarkMode ? "#fff" : "#7d0b02"}
            />
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
  darkTitle: { color: "#fff" },
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
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: { fontSize: 10, color: "#ccc" },
  downloadInfo: { flex: 1 },
  downloadTitle: { fontSize: 16, fontWeight: "bold", color: "#fff" },
  downloadType: { fontSize: 14, color: "#bbb" },
  progressContainer: { marginTop: 5 },
  progressText: { fontSize: 12, color: "#7d0b02", marginTop: 2 },
  downloadComplete: { fontSize: 12, color: "green", marginTop: 5 },
  noDownloads: { textAlign: "center", color: "#999", fontStyle: "italic" },
  darkNoDownloads: { color: "#bbb" },
  removeButton: { backgroundColor: "#FF5722", padding: 5, borderRadius: 5 },
  removeButtonText: { color: "#fff", fontSize: 12 },
});
