import React, { useState, useEffect, useContext, useCallback } from "react";
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Image,
  FlatList,
  Modal,
  StyleSheet,
  Switch,
  Alert
} from "react-native";
import { fetchPopularVids, fetchYouTubeSearchResults } from "@/utils/apiService";
import VideoList from "@/components/videoList";
import ModalPick from "@/components/DownloadPrompt";
import axios from "axios";
import { DownloadContext } from "./_layout";
import * as FileSystem from "expo-file-system";
import { Buffer } from "buffer";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";

// Types
type Video = {
  Title: string;
  Plot: string;
  Formats: string[];
  Poster: string;
};

type ActiveDownload = {
  title: string;
  progress: number; // as fraction from 0 to 100
};

type CompletedDownload = {
  id: string;
  title: string;
};

// Helper type for selected video metadata
type SelectedVideo = {
  url: string;
  title: string;
  poster: string;
};

export default function Home({ navigation }: any) {
  const [videos, setVideos] = useState<any[]>([]);
  const [downloadVids, setDownloadVids] = useState<Video[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setModalVisible] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<SelectedVideo>({ url: "", title: "", poster: "" });
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [isVisible, setVisible] = useState(false); // for paste link modal
  const DOWNLOADER_API = Constants.expoConfig?.extra?.API_Backend;
  const { setActiveDownloads, setCompleteDownloads } = useContext(DownloadContext);

  // Helper: Persist a new download record in AsyncStorage and update state.
  const addDownloadRecord = async (newRecord: any) => {
    try {
      const recordsStr = await AsyncStorage.getItem("downloadedFiles");
      let existingRecords = recordsStr ? JSON.parse(recordsStr) : [];
      // Prepend new record so that the newest appears first.
      const updatedRecords = [newRecord, ...existingRecords];
      await AsyncStorage.setItem("downloadedFiles", JSON.stringify(updatedRecords));
      // Optionally update local state if you want immediate feedback.
      // (If DownloadsScreen is separate, ensure it reloads on focus.)
    } catch (error) {
      console.error("Error saving download record:", error);
    }
  };

  // Handle search (by URL or YouTube search)
  const handleSearch = async () => {
    if (!searchQuery) return;
    setLoading(true);
    const isURL = searchQuery.startsWith("http://") || searchQuery.startsWith("https://");
    if (isURL) {
      await fetchByUrl(searchQuery);
    } else {
      try {
        const results = await fetchYouTubeSearchResults(searchQuery);
        setVideos(results || []);
      } catch (error) {
        console.error("Error Fetching Videos", error);
      }
    }
    setLoading(false);
  };

  // Fetch video details for a pasted URL
  const fetchByUrl = async (url: string) => {
    try {
      setLoading(true);
      const res = await axios.get(`${DOWNLOADER_API}/download-videos`, {
        params: { url }
      });
      console.log("Response:", res.data);
      const formatsArray = Array.isArray(res.data.formats)
        ? res.data.formats
        : typeof res.data.formats === "string"
          ? res.data.formats.split(",\n").map((line: string) => line.trim())
          : res.data.formats;
      const socialDownload: Video = {
        Title: res.data.title,
        Plot: "Download",
        Poster: res.data.thumbnail,
        Formats: formatsArray
      };
      setDownloadVids([socialDownload]);
    } catch (error) {
      console.error("Error Fetching Videos", error);
      Alert.alert("Error", "Unable to Fetch Data from Url");
    } finally {
      setLoading(false);
    }
  };

  // Load popular videos on mount
  useEffect(() => {
    const loadVideos = async () => {
      try {
        const popularVids = await fetchPopularVids();
        setVideos(popularVids || []);
      } catch (error) {
        console.log("Failed to load Videos", error);
      }
    };
    loadVideos();
  }, []);

  // When a video is selected for download from VideoList, open the download modal.
  const handleDownload = (video: { url: string; title: string; poster: string }) => {
    setSelectedVideo(video);
    setModalVisible(true);
  };

  // Save file to the device gallery (for video files)
  const saveFileToGallery = async (fileUri: string): Promise<string> => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Denied", "Cannot save file without permission.");
        return fileUri;
      }
      const asset = await MediaLibrary.createAssetAsync(fileUri);
      const album = await MediaLibrary.getAlbumAsync("Downloads");
      if (!album) {
        await MediaLibrary.createAlbumAsync("Downloads", asset, false);
      } else {
        await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      }
      return asset.uri;
    } catch (error) {
      console.error("Error saving file to gallery", error);
      Alert.alert("Error", "Failed to save file to gallery.");
      return fileUri;
    }
  };

  // Download logic: called when user selects a download option from ModalPick.
  const handleSelectOption = async (option: "audio" | "video") => {
    if (!selectedVideo.url) {
      Alert.alert("Error", "No video selected for download.");
      return;
    }
    setModalVisible(false);
    const downloadId = `${Date.now()}-${selectedVideo.url}`;
    const formatMapping: Record<string, string> = {
      video: "best",
      audio: "bestaudio"
    };
    const selectedFormat = formatMapping[option];

    try {
      // Add to active downloads context for progress (for visual updates)
      setActiveDownloads((prev: Record<string, ActiveDownload>) => ({
        ...prev,
        [downloadId]: { title: selectedVideo.title, progress: 0 }
      }));

      // Call the backend download endpoint
      const response = await axios({
        method: "post",
        url: `${DOWNLOADER_API}/download-videos`,
        data: { url: selectedVideo.url, format: selectedFormat },
        responseType: "arraybuffer",
        onDownloadProgress: progressEvent => {
          const total = progressEvent.total || 1;
          const progress = Math.round((progressEvent.loaded / total) * 100);
          setActiveDownloads((prev: Record<string, ActiveDownload>) => ({
            ...prev,
            [downloadId]: { ...prev[downloadId], progress }
          }));
        }
      });

      // Ensure download directory exists
      const downloadDir = `${FileSystem.documentDirectory}Downloads/`;
      const directoryInfo = await FileSystem.getInfoAsync(downloadDir);
      if (!directoryInfo.exists) {
        await FileSystem.makeDirectoryAsync(downloadDir, { intermediates: true });
      }

      // Use a sanitized file name based on the video title.
      const fileExtension = option === "audio" ? "m4a" : "mp4";
      const fileName = `${selectedVideo.title.replace(/\s+/g, "_")}.${fileExtension}`;
      const fileUri = `${downloadDir}${fileName}`;

      // Convert the downloaded ArrayBuffer to Base64 and write the file.
      const base64Data = Buffer.from(response.data).toString("base64");
      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64
      });

      // For video downloads, save the file to the Gallery.
      let finalFileUri = fileUri;
      if (option === "video") {
        finalFileUri = await saveFileToGallery(fileUri);
      }

      // Create a new download record.
      const newDownloadRecord = {
        id: downloadId,
        title: selectedVideo.title,
        Poster: selectedVideo.poster,
        fileUri: finalFileUri, // Use the asset URI if available
        type: option, // "audio" or "video"
        source: "direct",
        downloadedAt: Date.now()
      };

      // Persist the new record.
      const existingRecordsStr = await AsyncStorage.getItem("downloadedFiles");
      const existingRecords = existingRecordsStr ? JSON.parse(existingRecordsStr) : [];
      existingRecords.push(newDownloadRecord);
      await AsyncStorage.setItem("downloadedFiles", JSON.stringify(existingRecords));

      // Update complete downloads context and remove from active downloads.
      setCompleteDownloads(prev => [...prev, { id: downloadId, title: `${option.toUpperCase()} Download Complete` }]);
      setActiveDownloads((prev: Record<string, ActiveDownload>) => {
        const { [downloadId]: removed, ...rest } = prev;
        return rest;
      });

      Alert.alert("Success", `${option.toUpperCase()} download complete.`);
    } catch (error: any) {
      console.error("Download Error:", error);
      Alert.alert("Error", error.response?.data?.message || "Failed to download. Please try again.");
      setActiveDownloads((prev: Record<string, ActiveDownload>) => {
        const { [downloadId]: removed, ...rest } = prev;
        return rest;
      });
    } finally {
      setModalVisible(false);
    }
  };

  // Optional: handleLinks for additional pasted link downloads.
  const handleLinks = async (url: string) => {
    setLoading(true);
    try {
      await axios.post(`${DOWNLOADER_API}/download-videos`, { url });
    } catch (error) {
      console.log("Error Downloads Videos", error);
      Alert.alert("Error", "Unable to Download Videos");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.contain, isDarkMode && styles.darkMode]}>
      <View style={styles.toggleContainer}>
        <Image source={require("../../assets/images/Original.png")} style={{ width: 100, height: 100 }} />
        <Switch value={isDarkMode} onValueChange={setIsDarkMode} />
      </View>
      <View style={styles.container}>
        <TextInput
          style={styles.Input}
          placeholder="Search Youtube...or Paste Link"
          placeholderTextColor="#7d0b02"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity style={styles.button} onPress={handleSearch}>
          <Text style={styles.buttonText}>🔍</Text>
        </TouchableOpacity>
      </View>
      <VideoList videos={videos} onPlay={videoUrl => console.log("Play Video", videoUrl)} onDownload={handleDownload} />
      <ModalPick visable={isModalVisible} onClose={() => setModalVisible(false)} onSelect={handleSelectOption} />
      <TouchableOpacity style={styles.toggleButton} onPress={() => setVisible(!isVisible)}>
        <Text style={styles.toggleButtonText}>{isVisible ? "Hide List" : "Show Paste Link"}</Text>
      </TouchableOpacity>
      <Modal visible={isVisible} animationType="slide" transparent onRequestClose={() => setVisible(false)}>
        <View style={styles.modalContainer}>
          <TouchableOpacity style={styles.button} onPress={() => setVisible(false)}>
            <Text style={styles.buttonText}>Close</Text>
          </TouchableOpacity>
          <FlatList
            data={downloadVids}
            keyExtractor={(item, index) => index.toString()}
            renderItem={({ item }) => (
              <View style={styles.listItem}>
                <Image source={{ uri: item.Poster }} style={styles.thumbnail} />
                <Text style={styles.listTitle}>{item.Title}</Text>
                {Array.isArray(item.Formats) ? (
                  item.Formats.map((format, index) => (
                    <TouchableOpacity key={index} style={styles.button} onPress={() => handleLinks(format)}>
                      <Text style={styles.listTitle}>Download {format}</Text>
                    </TouchableOpacity>
                  ))
                ) : (
                  <Text style={styles.noFormatsText}>No formats available</Text>
                )}
              </View>
            )}
            contentContainerStyle={styles.listContainer}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  Input: {
    flex: 1,
    padding: 10,
    color: "#7d0b02"
  },
  contain: {
    flex: 1,
    padding: 10,
    borderWidth: 1
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
    padding: 10,
    marginVertical: 5,
    marginTop: 5
  },
  buttonText: {
    fontSize: 16
  },
  toggleContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10
  },
  darkMode: {
    backgroundColor: "#121212"
  },
  toggleButton: {
    backgroundColor: "#7d0b02",
    padding: 10,
    borderRadius: 5,
    alignItems: "center",
    marginBottom: 10
  },
  toggleButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold"
  },
  thumbnail: {
    height: 200,
    width: 200,
    borderRadius: 10,
    marginBottom: 10
  },
  listContainer: {
    padding: 15
  },
  listItem: {
    backgroundColor: "#f9f9f9",
    borderRadius: 10,
    padding: 10,
    marginVertical: 10,
    alignItems: "center"
  },
  listTitle: {
    marginTop: 5,
    marginBottom: 5
  },
  noFormatsText: {
    backgroundColor: "#7d0b02"
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 40
  }
});
