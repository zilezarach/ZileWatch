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
  Platform
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import * as Linking from "expo-linking";
import * as Progress from "react-native-progress";
import { DownloadContext } from "@/context/DownloadContext";

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
  const { activeDownloads } = useContext(DownloadContext);

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

  const getMimeType = (fileUri: string): string => {
    const extension = fileUri.split(".").pop()?.toLowerCase();

    const mimeTypes: { [key: string]: string } = {
      mp4: "video/mp4",
      mov: "video/quicktime",
      avi: "video/x-msvideo",
      mkv: "video/x-matroska",
      mp3: "audio/mpeg",
      m4a: "audio/mp4",
      aac: "audio/aac",
      wav: "audio/wav",
      ogg: "audio/ogg",
      flac: "audio/flac"
    };

    return mimeTypes[extension || ""] || "application/octet-stream";
  };

  const openFile = async (fileUri: string, fileType: string) => {
    try {
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (!fileInfo.exists) {
        Alert.alert("Error", "File not found or may have been deleted.");
        return;
      }

      const mimeType = getMimeType(fileUri);
      console.log("Opening file:", fileUri, "Type:", fileType, "MIME:", mimeType);

      if (Platform.OS === "android") {
        try {
          const { status } = await MediaLibrary.requestPermissionsAsync();

          if (status !== "granted") {
            Alert.alert("Permission Required", "Please grant media library permissions to open files.");
            return;
          }

          const asset = await MediaLibrary.createAssetAsync(fileUri);

          const contentUri = await FileSystem.getContentUriAsync(fileUri);

          const canOpen = await Linking.canOpenURL(contentUri);
          if (canOpen) {
            await Linking.openURL(contentUri);
            return;
          }

          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri, {
              mimeType,
              dialogTitle: `Open ${fileType === "audio" ? "Audio" : "Video"} File`
            });
            return;
          }

          Alert.alert("Error", "No app found to open this file.");
        } catch (error) {
          console.error("Error opening file on Android:", error);

          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri, {
              mimeType,
              dialogTitle: `Open ${fileType === "audio" ? "Audio" : "Video"} File`
            });
          } else {
            Alert.alert("Error", "Unable to open the file. Please install a media player app.");
          }
        }
      } else if (Platform.OS === "ios") {
        try {
          const canOpen = await Linking.canOpenURL(fileUri);
          if (canOpen) {
            await Linking.openURL(fileUri);
            return;
          }
        } catch (error) {
          console.log("iOS direct open error:", error);
        }

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, { mimeType });
          return;
        }

        Alert.alert("Error", "No app found to open this file.");
      }
    } catch (error) {
      console.error("Error opening file:", error);
      Alert.alert("Error", "Unable to open the file. Please try again.");
    }
  };

  const removeDownloadRecord = async (id: string, fileUri: string) => {
    Alert.alert("Remove Download", "Do you want to delete the file from your device as well?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove Record Only",
        onPress: async () => {
          try {
            const updatedRecords = downloadRecords.filter(record => record.id !== id);
            await AsyncStorage.setItem("downloadedFiles", JSON.stringify(updatedRecords));
            setDownloadRecords(updatedRecords);
            ToastAndroid.show("Download record removed", ToastAndroid.SHORT);
          } catch (error) {
            console.error("Error removing download record:", error);
            Alert.alert("Error", "Failed to remove download record.");
          }
        }
      },
      {
        text: "Delete File",
        onPress: async () => {
          try {
            const fileInfo = await FileSystem.getInfoAsync(fileUri);
            if (fileInfo.exists) {
              await FileSystem.deleteAsync(fileUri);

              try {
                const asset = await MediaLibrary.getAssetInfoAsync(fileUri);
                if (asset) {
                  await MediaLibrary.deleteAssetsAsync([asset]);
                }
              } catch (mlError) {
                console.log("MediaLibrary delete error (may not exist):", mlError);
              }
            }

            const updatedRecords = downloadRecords.filter(record => record.id !== id);
            await AsyncStorage.setItem("downloadedFiles", JSON.stringify(updatedRecords));
            setDownloadRecords(updatedRecords);
            ToastAndroid.show("Download and file removed", ToastAndroid.SHORT);
          } catch (error) {
            console.error("Error deleting file and record:", error);
            Alert.alert("Error", "Failed to delete file and record.");
          }
        }
      }
    ]);
  };

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

  const renderDownloadItem = ({ item }: { item: DownloadRecord }) => {
    const progress = activeDownloads[item.id]?.progress ?? item.progress ?? 100;

    return (
      <TouchableOpacity
        style={styles.downloadItem}
        onPress={() => openFile(item.fileUri, item.type)}
        activeOpacity={0.7}>
        {item.Poster ? (
          <Image source={{ uri: item.Poster }} style={styles.thumbnail} />
        ) : (
          <View style={[styles.thumbnail, styles.placeholderThumbnail]}>
            <Text style={styles.placeholderText}>No Image</Text>
          </View>
        )}

        <View style={styles.downloadInfo}>
          <Text style={styles.downloadTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.downloadType}>{item.type.toUpperCase()}</Text>

          <View style={styles.progressContainer}>
            <Progress.Bar
              progress={progress / 100}
              width={null}
              height={10}
              color={progress < 100 ? "#7d0b02" : "green"}
              borderRadius={5}
            />
            {progress < 100 ? (
              <Text style={styles.progressText}>{progress}%</Text>
            ) : (
              <Text style={styles.downloadComplete}>Complete</Text>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={styles.removeButton}
          onPress={e => {
            e.stopPropagation();
            removeDownloadRecord(item.id, item.fileUri);
          }}
          activeOpacity={0.7}>
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
          onPress={() => {
            Alert.alert("Clear Downloads", "Are you sure you want to remove all downloads?", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Yes",
                onPress: async () => {
                  try {
                    for (const record of downloadRecords) {
                      const fileInfo = await FileSystem.getInfoAsync(record.fileUri);
                      if (fileInfo.exists) {
                        await FileSystem.deleteAsync(record.fileUri);
                      }
                    }
                    await AsyncStorage.removeItem("downloadedFiles");
                    setDownloadRecords([]);
                    ToastAndroid.show("Downloads cleared", ToastAndroid.SHORT);
                  } catch (error) {
                    console.error("Error clearing downloads:", error);
                    Alert.alert("Error", "Failed to clear downloads.");
                  }
                }
              }
            ]);
          }}>
          <Text style={styles.clearButtonText}>Clear All</Text>
        </TouchableOpacity>
        <Switch value={isDarkMode} onValueChange={setIsDarkMode} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#7d0b02" style={styles.loader} />
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
  loader: { marginTop: 50 },
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
  downloadType: { fontSize: 14, color: "#bbb", marginTop: 2 },
  progressContainer: { marginTop: 5 },
  progressText: { fontSize: 12, color: "#7d0b02", marginTop: 2 },
  downloadComplete: { fontSize: 12, color: "green", marginTop: 2 },
  noDownloads: {
    textAlign: "center",
    color: "#999",
    fontStyle: "italic",
    marginTop: 50
  },
  removeButton: {
    backgroundColor: "#FF5722",
    padding: 8,
    borderRadius: 5,
    marginLeft: 10
  },
  removeButtonText: { color: "#fff", fontSize: 12 }
});
