import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  Linking,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

type DownloadRecord = {
  id: string;
  title: string;
  fileUri: string;
  type: string;
  thumbnail?: string;
};

export default function DownloadsScreen() {
  const [downloadRecords, setDownloadRecords] = useState<DownloadRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Function to load downloads from AsyncStorage
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

  useEffect(() => {
    loadDownloads();
  }, []);

  const openFile = async (fileUri: string) => {
    try {
      const supported = await Linking.canOpenURL(fileUri);
      if (supported) {
        await Linking.openURL(fileUri);
      } else {
        Alert.alert("Error", "File format not supported on your device.");
      }
    } catch (error) {
      console.error("Error opening file", error);
      Alert.alert("Error", "Unable to open file.");
    }
  };

  const renderItem = ({ item }: { item: DownloadRecord }) => (
    <TouchableOpacity
      style={styles.downloadItem}
      onPress={() => openFile(item.fileUri)}
    >
      {item.thumbnail ? (
        <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
      ) : (
        <View style={[styles.thumbnail, styles.placeholderThumbnail]}>
          <Text style={styles.placeholderText}>No Image</Text>
        </View>
      )}
      <View style={styles.downloadInfo}>
        <Text style={styles.downloadTitle}>{item.title}</Text>
        <Text style={styles.downloadType}>{item.type.toUpperCase()}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Downloads</Text>
      {loading ? (
        <Text style={styles.loadingText}>Loading downloads...</Text>
      ) : (
        <FlatList
          data={downloadRecords}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={
            <Text style={styles.noDownloads}>No downloads found.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#7d0b02",
  },
  loadingText: {
    textAlign: "center",
    color: "#555",
  },
  downloadItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E1E1E",
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 5,
    marginRight: 10,
  },
  placeholderThumbnail: {
    backgroundColor: "#ccc",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    fontSize: 10,
    color: "#333",
  },
  downloadInfo: {
    flex: 1,
  },
  downloadTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
  },
  downloadType: {
    fontSize: 14,
    color: "#bbb",
  },
  noDownloads: {
    textAlign: "center",
    color: "#999",
    fontStyle: "italic",
  },
});
