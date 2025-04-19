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
  PlatformColor
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
import FileViewer from "react-native-file-viewer";

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
  const [hasMediaPermission, setHasMediaPermission] = useState<boolean>(false);
  const [isModalVisible, setModalVisible] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<SelectedVideo>({
    url: "",
    title: "",
    poster: ""
  });
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

  // Refactored permission handling function

  const requestStoragePermissions = async () => {
    try {
      const internalDir = `${FileSystem.cacheDirectory}ZileWatch/`;
      await ensureDirectoryExists(internalDir);
    } catch (error) {
      console.error("Error in requestStoragePermissions:", error);
      // Fallback to app-specific storage
      const fallbackDir = `${FileSystem.cacheDirectory}ZileWatch/`;
      await ensureDirectoryExists(fallbackDir);
      return fallbackDir;
    }
  };
  // Helper function to ensure a directory exists
  const ensureDirectoryExists = async (directory: string) => {
    const directoryInfo = await FileSystem.getInfoAsync(directory);
    if (!directoryInfo.exists) {
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    }
    return directory;
  };

  //function to request permissions at first launch
  const checkForPermissions = async () => {
    try {
      // Only request media permissions here, storage permissions are handled separately
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
  //Loading the downloads when permission is made
  useEffect(() => {
    checkForPermissions();
    (async () => {
      // Check if we already have permission
      const existingStatus = await MediaLibrary.getPermissionsAsync();
      if (existingStatus.status === "granted") {
        setHasMediaPermission(true);
      } else {
        // Request permission
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === "granted") {
          setHasMediaPermission(true);
        } else {
          Alert.alert("Permission Denied", "Cannot save files to gallery without permission.");
        }
      }
    })();
  }, []);
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
      const res = await axios.get(`${DOWNLOADER_API}/download-videos`, {
        params: { url }
      });
      console.log("Response", res.data);
      let formatsArray = [];
      if (Array.isArray(res.data.formats)) {
        formatsArray = res.data.formats;
      } else if (typeof res.data.formats === "string") {
        formatsArray = res.data.formats
          .split(",\n")
          .map((line: string) => line.trim())
          .filter((line: string) => line.length > 0);
      }
      const video: Video & { url: string } = {
        url,
        Title: res.data.title,
        Plot: "Download",
        Poster: res.data.thumbnail,
        Formats: formatsArray
      };
      setDownloadVids([video]);
      setSelectedVideo({ url, title: video.Title, poster: video.Poster });
    } catch (error) {
      console.error("Unable to Fetch Video", error);
      Alert.alert("Error", "Unable to fetch videos from Url");
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
      const asset = await MediaLibrary.createAssetAsync(fileUri);
      const album = await MediaLibrary.getAlbumAsync("ZileWatch");

      if (album === null) {
        await MediaLibrary.createAlbumAsync("ZileWatch", asset, false);
      } else {
        await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      }

      // Return the asset URI which is more reliable for accessing later
      return asset.uri;
    } catch (error) {
      console.error("Error saving to gallery:", error);
      // If there's an error, return the original URI as fallback
      return fileUri;
    }
  };
  //Opening File
  const openFile = async (fileUri: string) => {
    try {
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (!fileInfo.exists) {
        Alert.alert("Error", "File not found");
        return;
      }
      console.log("Attempting to open file:", fileUri);

      let fileToOpen = fileUri;
      // If fileUri is a SAF URI on Android, copy to cache first.
      if (Platform.OS === "android" && fileUri.startsWith("content://")) {
        const cacheFileUri = `${FileSystem.cacheDirectory}${selectedVideo.title
          .replace(/[^a-z0-9\s]/gi, "")
          .replace(/\s+/g, "_")}_${Date.now()}.mp4`;
        await FileSystem.copyAsync({ from: fileUri, to: cacheFileUri });
        fileToOpen = cacheFileUri;
        console.log("Copied SAF file to cache:", fileToOpen);
      }
      // Ensure the file URI starts with file:// if needed.
      if (!fileToOpen.startsWith("file://")) {
        fileToOpen = `file://${fileToOpen}`;
      }
      await FileViewer.open(fileToOpen, { showOpenWithDialog: true });
    } catch (error) {
      console.error("Error opening file with FileViewer:", error);
      Alert.alert("Error", "Unable to open file");
    }
  };
  // Download logic: called when user selects a download option from ModalPick.

  const handleSelectOption = async (option: "audio" | "video") => {
    if (!selectedVideo.url) return Alert.alert("Error", "No video selected");
    setModalVisible(false);
    const downloadId = `${Date.now()}-${selectedVideo.url}`;
    setActiveDownloads(prev => ({ ...prev, [downloadId]: { title: selectedVideo.title, progress: 0 } }));
    try {
      const dir = await requestStoragePermissions();
      const response = await axios.post(
        `${DOWNLOADER_API}/download-videos`,
        { url: selectedVideo.url, format: option === "video" ? "best" : "bestaudio" },
        {
          responseType: "arraybuffer",
          onDownloadProgress: e => {
            const prog = Math.round((e.loaded / (e.total || 1)) * 100);
            setActiveDownloads(prev => ({ ...prev, [downloadId]: { ...prev[downloadId], progress: prog } }));
          }
        }
      );
      const ext = option === "video" ? "mp4" : "m4a";
      const filename = `${selectedVideo.title.replace(/[^a-z0-9]/gi, "_")}_${Date.now()}.${ext}`;
      const filepath = `${dir}${filename}`;
      await FileSystem.writeAsStringAsync(filepath, Buffer.from(response.data).toString("base64"), {
        encoding: FileSystem.EncodingType.Base64
      });
      let finalUri = filepath;
      if (option === "video" && hasMediaPermission) finalUri = await saveFileToGallery(filepath);
      await addDownloadRecord({
        id: downloadId,
        title: selectedVideo.title,
        Poster: selectedVideo.poster,
        fileUri: finalUri,
        type: option,
        downloadedAt: Date.now()
      });
      setCompleteDownloads(prev => [...prev, { id: downloadId, title: `${option.toUpperCase()} Complete` }]);
      setActiveDownloads(prev => {
        const { [downloadId]: _, ...rest } = prev;
        return rest;
      });
      Alert.alert("Success", `${option.toUpperCase()} download complete`, [
        { text: "OK" },
        { text: "Open File", onPress: () => openFile(finalUri) }
      ]);
    } catch (e) {
      console.error(e);
      Alert.alert("Download failed", "Please try again");
      setActiveDownloads(prev => {
        const { [downloadId]: _, ...rest } = prev;
        return rest;
      });
    }
  };
  // Optional: handleLinks for additional pasted link downloads.
  const handleLinks = async (formatId: string) => {
    setLoading(true);
    try {
      const response = await axios.post(`${DOWNLOADER_API}/download-videos`, {
        url: selectedVideo.url,
        format: formatId // Send the actual format ID instead of format name
      });
      // Handle download response...
    } catch (error) {
      console.error("Download Error:", error);
      Alert.alert("Error", "Failed to start download. Unsupported URL format.");
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
                <TouchableOpacity
                  style={styles.button}
                  onPress={() => {
                    setSelectedVideo({ url: item.url, title: item.Title, poster: item.Poster });
                    handleSelectOption("video");
                  }}>
                  <Text style={styles.buttonText}>Video</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.button}
                  onPress={() => {
                    setSelectedVideo({ url: item.url, title: item.Title, poster: item.Poster });
                    handleSelectOption("audio");
                  }}>
                  <Text style={styles.buttonText}>Audio</Text>
                </TouchableOpacity>
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
