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
  Alert,
  Platform,
  ActivityIndicator,
} from "react-native";
import {
  fetchPopularVids,
  fetchYouTubeSearchResults,
} from "../../utils/apiService";
import VideoList from "../../components/videoList";
import ModalPick from "../../components/DownloadPrompt";
import axios from "axios";
import { DownloadContext } from "@/context/DownloadContext";
import * as FileSystem from "expo-file-system";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as MediaLibrary from "expo-media-library";
import FileViewer from "react-native-file-viewer";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/types/navigation";
import * as Progress from "react-native-progress";

// Types
type Video = {
  Title: string;
  Plot: string;
  url: string;
  Formats: Array<{
    id: string;
    quality: string;
    size: string;
    format: string;
  }>;
  Poster: string;
};

type SelectedVideo = {
  url: string;
  title: string;
  poster: string;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList, "Home">;

export default function Home() {
  const [videos, setVideos] = useState<any[]>([]);
  const [downloadVids, setDownloadVids] = useState<Video[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasMediaPermission, setHasMediaPermission] = useState<boolean>(false);
  const [isModalVisible, setModalVisible] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<SelectedVideo>({
    url: "",
    title: "",
    poster: "",
  });
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [isVisible, setVisible] = useState(false);
  const navigation = useNavigation<NavigationProp>();
  const [isStreaming, setIsStreaming] = useState(false);

  const DOWNLOADER_API = Constants.expoConfig?.extra?.API_Backend;
  const { setActiveDownloads, setCompleteDownloads, activeDownloads } =
    useContext(DownloadContext);

  // Helper: Persist a new download record in AsyncStorage
  const addDownloadRecord = async (newRecord: any) => {
    try {
      const recordsStr = await AsyncStorage.getItem("downloadedFiles");
      let existingRecords = recordsStr ? JSON.parse(recordsStr) : [];
      const updatedRecords = [newRecord, ...existingRecords];
      await AsyncStorage.setItem(
        "downloadedFiles",
        JSON.stringify(updatedRecords),
      );
    } catch (error) {
      console.error("Error saving download record:", error);
    }
  };

  // Storage permissions
  const requestStoragePermissions = async () => {
    try {
      const internalDir = `${FileSystem.cacheDirectory}ZileWatch/`;
      await ensureDirectoryExists(internalDir);
      return internalDir;
    } catch (error) {
      console.error("Error in requestStoragePermissions:", error);
      const fallbackDir = `${FileSystem.cacheDirectory}ZileWatch/`;
      await ensureDirectoryExists(fallbackDir);
      return fallbackDir;
    }
  };

  const ensureDirectoryExists = async (directory: string) => {
    const directoryInfo = await FileSystem.getInfoAsync(directory);
    if (!directoryInfo.exists) {
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    }
    return directory;
  };

  const checkForPermissions = async () => {
    try {
      if (Platform.OS === "android") {
        const mediaPermission = await MediaLibrary.getPermissionsAsync();
        if (mediaPermission.status === "granted") {
          setHasMediaPermission(true);
        } else {
          const { status } = await MediaLibrary.requestPermissionsAsync();
          if (status === "granted") {
            setHasMediaPermission(true);
          }
        }
      }
    } catch (error) {
      console.error("Error checking media permissions", error);
    }
  };

  useEffect(() => {
    checkForPermissions();
  }, []);

  // Handle search (by URL or YouTube search)
  const handleSearch = async () => {
    if (!searchQuery) return;
    setLoading(true);
    const isURL =
      searchQuery.startsWith("http://") || searchQuery.startsWith("https://");

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
      const res = await axios.get(`${DOWNLOADER_API}/video-info`, {
        params: { url },
      });

      if (!res.data.success) {
        Alert.alert("Error", res.data.message || "Invalid URL");
        return;
      }

      const video: Video & { url: string } = {
        url,
        Title: res.data.title,
        Plot: "Download",
        Poster: res.data.thumbnail,
        Formats: res.data.formats || [],
      };

      setDownloadVids([video]);
      setSelectedVideo({ url, title: video.Title, poster: video.Poster });
      setVisible(true); // Show the paste link modal
    } catch (error) {
      console.error("Unable to Fetch Video", error);
      Alert.alert("Error", "Unable to fetch videos from URL");
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

  // When a video is selected for download from VideoList
  const handleDownload = (video: {
    url: string;
    title: string;
    poster: string;
  }) => {
    setSelectedVideo(video);
    setModalVisible(true);
  };

  // Save file to the device gallery
  const saveFileToGallery = async (fileUri: string): Promise<string> => {
    try {
      const asset = await MediaLibrary.createAssetAsync(fileUri);
      const album = await MediaLibrary.getAlbumAsync("ZileWatch");

      if (album === null) {
        await MediaLibrary.createAlbumAsync("ZileWatch", asset, false);
      } else {
        await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      }

      return asset.uri;
    } catch (error) {
      console.error("Error saving to gallery:", error);
      return fileUri;
    }
  };

  // Open file
  const openFile = async (fileUri: string) => {
    try {
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (!fileInfo.exists) {
        Alert.alert("Error", "File not found");
        return;
      }

      let fileToOpen = fileUri;
      if (Platform.OS === "android" && fileUri.startsWith("content://")) {
        const cacheFileUri = `${FileSystem.cacheDirectory}temp_${Date.now()}.mp4`;
        await FileSystem.copyAsync({ from: fileUri, to: cacheFileUri });
        fileToOpen = cacheFileUri;
      }

      if (!fileToOpen.startsWith("file://")) {
        fileToOpen = `file://${fileToOpen}`;
      }

      await FileViewer.open(fileToOpen, { showOpenWithDialog: true });
    } catch (error) {
      console.error("Error opening file:", error);
      Alert.alert("Error", "Unable to open file");
    }
  };

  //  video handler
  const handlePlay = async (videoUrl: string) => {
    try {
      setIsStreaming(true);

      // Get streaming URL from backend
      const response = await axios.get(`${DOWNLOADER_API}/stream-videos`, {
        params: { url: videoUrl },
        timeout: 60000,
      });

      if (!response.data.success || !response.data.streamUrl) {
        throw new Error("Unable to get streaming URL");
      }

      // Navigate to VideoPlayer with streaming URL
      navigation.navigate("VideoPlayer", {
        videoUrl: response.data.streamUrl,
        isStreaming: true,
        originalUrl: videoUrl,
      });
    } catch (error) {
      console.error("Streaming error:", error);
      Alert.alert(
        "Error",
        "Unable to stream this video. Try downloading instead.",
      );
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSelectOption = async (option: "audio" | "video") => {
    if (!selectedVideo.url) return Alert.alert("Error", "No video selected");
    setModalVisible(false);
    setVisible(false); // Close any open modal

    const downloadId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Initialize download in context
    setActiveDownloads((prev) => ({
      ...prev,
      [downloadId]: { title: selectedVideo.title, progress: 0 },
    }));

    try {
      const dir = await requestStoragePermissions();

      // Get direct download URL from backend
      const streamResponse = await axios.get(
        `${DOWNLOADER_API}/stream-videos`,
        {
          params: {
            url: selectedVideo.url,
            quality: option === "audio" ? "audio" : "best",
          },
          timeout: 30000,
        },
      );

      if (!streamResponse.data.success || !streamResponse.data.streamUrl) {
        throw new Error("No direct stream URL available");
      }

      const downloadUrl = streamResponse.data.streamUrl;
      const ext = option === "video" ? "mp4" : "m4a";
      const filename = `${selectedVideo.title.replace(/[^a-z0-9]/gi, "_")}_${Date.now()}.${ext}`;
      const filepath = `${dir}${filename}`;

      // Create resumable download with progress callback
      const downloadResumable = FileSystem.createDownloadResumable(
        downloadUrl,
        filepath,
        {},
        (downloadProgress) => {
          const progress =
            downloadProgress.totalBytesWritten /
            downloadProgress.totalBytesExpectedToWrite;
          const percent = Math.round(progress * 100);

          // Update progress in context
          setActiveDownloads((prev) => ({
            ...prev,
            [downloadId]: { ...prev[downloadId], progress: percent },
          }));
        },
      );

      // Start download
      const result = await downloadResumable.downloadAsync();

      if (!result) {
        throw new Error("Download Failed");
      }

      let finalUri = result.uri;

      // Save to gallery if video
      if (option === "video" && hasMediaPermission && finalUri) {
        finalUri = await saveFileToGallery(finalUri);
      }

      // Persist record
      await addDownloadRecord({
        id: downloadId,
        title: selectedVideo.title,
        Poster: selectedVideo.poster,
        fileUri: finalUri,
        type: option,
        downloadedAt: Date.now(),
        progress: 100,
      });

      setCompleteDownloads((prev) => [
        ...prev,
        { id: downloadId, title: `${option.toUpperCase()} Complete` },
      ]);

      setActiveDownloads((prev) => {
        const { [downloadId]: _, ...rest } = prev;
        return rest;
      });

      Alert.alert("Success", `${option.toUpperCase()} download complete`, [
        { text: "OK" },
        { text: "Open File", onPress: () => openFile(finalUri) },
      ]);
    } catch (error) {
      console.error("Download error:", error);
      Alert.alert("Download failed", "Please try again");

      setActiveDownloads((prev) => {
        const { [downloadId]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  // Render progress indicator for active downloads
  const renderActiveDownloads = () => {
    const downloads = Object.entries(activeDownloads);

    if (downloads.length === 0) return null;

    return (
      <View style={styles.activeDownloadsContainer}>
        <Text style={styles.activeDownloadsTitle}>Active Downloads:</Text>
        {downloads.map(([id, download]) => (
          <View key={id} style={styles.downloadItem}>
            <Text style={styles.downloadTitle} numberOfLines={1}>
              {download.title}
            </Text>
            <Progress.Bar
              progress={download.progress / 100}
              width={null}
              height={10}
              color="#7d0b02"
              unfilledColor="#333"
              borderColor="#7d0b02"
              borderRadius={5}
              style={styles.progressBar}
            />
            <Text style={styles.progressText}>{download.progress}%</Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={[styles.contain, isDarkMode && styles.darkMode]}>
      <View style={styles.toggleContainer}>
        <Image
          source={require("../../assets/images/Original.png")}
          style={{ width: 100, height: 100 }}
        />
        <Switch value={isDarkMode} onValueChange={setIsDarkMode} />
      </View>

      <View style={styles.container}>
        <TextInput
          style={styles.Input}
          placeholder="Search YouTube...or Paste Link"
          placeholderTextColor="#7d0b02"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity
          style={styles.button}
          onPress={handleSearch}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.buttonText}>🔍</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Show active downloads with progress */}
      {renderActiveDownloads()}

      {/* Show streaming indicator */}
      {isStreaming && (
        <View style={styles.streamingIndicator}>
          <ActivityIndicator size="small" color="#7d0b02" />
          <Text style={styles.streamingText}>Loading stream...</Text>
        </View>
      )}

      <VideoList
        videos={videos}
        onPlay={handlePlay}
        onDownload={handleDownload}
      />

      <ModalPick
        visable={isModalVisible}
        onClose={() => setModalVisible(false)}
        onSelect={handleSelectOption}
      />

      {/* Paste Link Modal */}
      <Modal
        visible={isVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => setVisible(false)}
          >
            <Text style={styles.buttonText}>Close</Text>
          </TouchableOpacity>

          <FlatList
            data={downloadVids}
            keyExtractor={(item, index) => index.toString()}
            renderItem={({ item }) => (
              <View style={styles.listItem}>
                <Image source={{ uri: item.Poster }} style={styles.thumbnail} />
                <Text style={styles.listTitle}>{item.Title}</Text>

                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.button, styles.actionButton]}
                    onPress={() => {
                      setSelectedVideo({
                        url: item.url,
                        title: item.Title,
                        poster: item.Poster,
                      });
                      handleSelectOption("video");
                    }}
                  >
                    <Text style={styles.buttonText}>📹 Video</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.button, styles.actionButton]}
                    onPress={() => {
                      setSelectedVideo({
                        url: item.url,
                        title: item.Title,
                        poster: item.Poster,
                      });
                      handleSelectOption("audio");
                    }}
                  >
                    <Text style={styles.buttonText}>🎵 Audio</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.button, styles.actionButton]}
                    onPress={() => handlePlay(item.url)}
                  >
                    <Text style={styles.buttonText}>▶️ Play</Text>
                  </TouchableOpacity>
                </View>
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
    color: "#7d0b02",
  },
  contain: {
    flex: 1,
    padding: 10,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    margin: 15,
    borderColor: "#7d0b02",
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  button: {
    backgroundColor: "#7d0b02",
    borderRadius: 5,
    padding: 10,
    marginVertical: 5,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: {
    fontSize: 16,
    color: "#fff",
  },
  toggleContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  darkMode: {
    backgroundColor: "#121212",
  },
  thumbnail: {
    height: 200,
    width: "100%",
    borderRadius: 10,
    marginBottom: 10,
  },
  listContainer: {
    padding: 15,
  },
  listItem: {
    backgroundColor: "#f9f9f9",
    borderRadius: 10,
    padding: 15,
    marginVertical: 10,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    paddingTop: 40,
  },
  activeDownloadsContainer: {
    backgroundColor: "#1e1e1e",
    padding: 10,
    marginHorizontal: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  activeDownloadsTitle: {
    color: "#fff",
    fontWeight: "bold",
    marginBottom: 10,
  },
  downloadItem: {
    marginBottom: 10,
  },
  downloadTitle: {
    color: "#fff",
    fontSize: 14,
    marginBottom: 5,
  },
  progressBar: {
    marginVertical: 5,
  },
  progressText: {
    color: "#7d0b02",
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "right",
  },
  streamingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    backgroundColor: "#fff3cd",
    marginHorizontal: 15,
    borderRadius: 5,
    marginBottom: 10,
  },
  streamingText: {
    marginLeft: 10,
    color: "#856404",
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 10,
  },
  actionButton: {
    flex: 1,
    marginHorizontal: 5,
  },
});
