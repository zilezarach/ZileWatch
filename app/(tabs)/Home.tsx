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
  Formats: Array<{
    id: string;
    quality: string;
    size: string;
    format: string;
  }>;
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
  //function to request permissions at first launch
  const checkForPermissions = async () => {
    try {
      //check if permissions are allowed
      const storedPermissions = await AsyncStorage.getItem("storedPermissions");
      if (!storedPermissions && Platform.OS === "android") {
        Alert.alert(
          "Storage permissions required",
          "The app requires storage permission for saving downloaded files in your phone",
          [
            {
              text: "Setup Now",
              onPress: async () => {
                try {
                  const getPermissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
                  if (getPermissions.granted) {
                    await AsyncStorage.setItem("storagePermissions", JSON.stringify(getPermissions));
                    Alert.alert("Permission Access Accepted");
                  } else {
                    Alert.alert("Permission Denied", "User decline");
                  }
                } catch (error) {
                  console.error("Error during allowing permission", error);
                  Alert.alert("Unable to allow permissions");
                }
              }
            },
            {
              text: "Later",
              style: "cancel"
            }
          ]
        );
      }
      if (Platform.OS === "android") {
        const mediaPerimission = await MediaLibrary.getPermissionsAsync();
        if (mediaPerimission.status === "granted") {
          const { status } = await MediaLibrary.requestPermissionsAsync();
        }
        if (status === "granted") {
          setHasMediaPermission(true);
        } else {
          setHasMediaPermission(true);
        }
      }
    } catch (error) {
      console.error("Error Checking File permissions", error);
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
      const socialDownload: Video = {
        Title: res.data.title,
        Plot: "Download",
        Poster: res.data.thumbnail,
        Formats: formatsArray
      };
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
  // Helper function to determine the proper storage directory

  const getStorageDirectory = async () => {
    if (Platform.OS === "ios") {
      // For iOS, create a dedicated directory
      const directory = `${FileSystem.documentDirectory}ZileWatch/`;
      const directoryInfo = await FileSystem.getInfoAsync(directory);
      if (!directoryInfo.exists) {
        await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      }
      return directory;
    } else {
      try {
        // For Android, check for existing permissions first
        const storedPermissions = await AsyncStorage.getItem("storagePermissions");
        if (storedPermissions) {
          const permissions = JSON.parse(storedPermissions);
          if (permissions.directoryUri) {
            return permissions.directoryUri;
          }
        }

        // If no valid permissions found or it's the first launch, request them
        Alert.alert("Storage Access Required", "Please select a folder where your downloads will be saved.", [
          {
            text: "Select Folder",
            onPress: async () => {
              try {
                const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
                if (permissions.granted) {
                  // Store the permissions for future use
                  await AsyncStorage.setItem("storagePermissions", JSON.stringify(permissions));
                  return permissions.directoryUri;
                }
              } catch (error) {
                console.error("Error requesting directory permissions:", error);
              }

              // Fallback to app storage if permissions not granted
              const directory = `${FileSystem.cacheDirectory}ZileWatch/`;
              const directoryInfo = await FileSystem.getInfoAsync(directory);
              if (!directoryInfo.exists) {
                await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
              }
              return directory;
            }
          }
        ]);

        // Default fallback while waiting for user selection
        const directory = `${FileSystem.cacheDirectory}ZileWatch/`;
        const directoryInfo = await FileSystem.getInfoAsync(directory);
        if (!directoryInfo.exists) {
          await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
        }
        return directory;
      } catch (error) {
        console.log("Error accessing storage directory:", error);
        // Fallback to app-specific storage
        const directory = `${FileSystem.cacheDirectory}ZileWatch/`;
        const directoryInfo = await FileSystem.getInfoAsync(directory);
        if (!directoryInfo.exists) {
          await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
        }
        return directory;
      }
    }
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
  // MIME HELPER FUNCTION
  const getMimeType = (fileUri: string) => {
    if (fileUri.endsWith(".mp4")) return "video/mp4";
    if (fileUri.endsWith(".m4a")) return "audio/m4a";
    return "application/octet-stream"; // Fallback
  };
  // Download logic: called when user selects a download option from ModalPick.
  const handleSelectOption = async (option: "audio" | "video") => {
    if (!selectedVideo.url) {
      Alert.alert("Error", "No video selected for download.");
      return;
    }

    // Check permissions - both storage write and media library permissions
    if (Platform.OS === "android") {
      const storedPermissions = await AsyncStorage.getItem("storagePermissions");

      if (!storedPermissions) {
        Alert.alert(
          "Storage Access Required",
          "You'll need to select a folder where your downloads will be saved. This will only be asked once.",
          [{ text: "OK", onPress: () => continueDownload(option) }]
        );
        return;
      }
    }

    continueDownload(option);
  };

  // Separated download logic
  const continueDownload = async (option: "audio" | "video") => {
    setModalVisible(false);
    const downloadId = `${Date.now()}-${selectedVideo.url}`;
    const formatMapping: Record<string, string> = {
      video: "best",
      audio: "bestaudio"
    };
    const selectedFormat = formatMapping[option];

    try {
      // Check permissions - both storage write and media library permissions
      if (Platform.OS === "android") {
        const storagePermission = await MediaLibrary.requestPermissionsAsync();
        if (!storagePermission.granted) {
          Alert.alert("Permission Required", "Storage permission is needed to save files.");
          return;
        }
      }

      // Add to active downloads context
      setActiveDownloads((prev: Record<string, ActiveDownload>) => ({
        ...prev,
        [downloadId]: { title: selectedVideo.title, progress: 0 }
      }));

      // Create directory before attempting to download
      const downloadDir = await getStorageDirectory();

      // Ensure directory exists (important step)
      if (!downloadDir.startsWith("content://")) {
        const directoryInfo = await FileSystem.getInfoAsync(downloadDir);
        if (!directoryInfo.exists) {
          await FileSystem.makeDirectoryAsync(downloadDir, {
            intermediates: true
          });
        }
      }

      // Call the backend download endpoint
      const response = await axios({
        method: "post",
        url: `${DOWNLOADER_API}/download-videos`,
        data: { url: selectedVideo.url, format: selectedFormat },
        responseType: "arraybuffer",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/octet-stream"
        },
        onDownloadProgress: progressEvent => {
          const total = progressEvent.total || 1;
          const progress = Math.round((progressEvent.loaded / total) * 100);
          setActiveDownloads((prev: Record<string, ActiveDownload>) => ({
            ...prev,
            [downloadId]: { ...prev[downloadId], progress }
          }));
        }
      });

      // Check if response data exists and has length
      if (!response.data || response.data.length === 0) {
        throw new Error("Received empty response from server");
      }

      // Use a sanitized filename
      const fileExtension = option === "audio" ? "m4a" : "mp4";
      const sanitizedTitle = selectedVideo.title
        .replace(/[^a-z0-9\s]/gi, "") // Remove special characters
        .replace(/\s+/g, "_"); // Replace spaces with underscores

      let fileUri = "";
      if (Platform.OS === "android" && downloadDir.startsWith("content://")) {
        // For Android with SAF permissions
        const fileData = Buffer.from(response.data).toString("base64");
        const fileName = `${sanitizedTitle}_${Date.now()}.${fileExtension}`;
        const mimeType = option === "audio" ? "audio/m4a" : "video/mp4";
        try {
          // Create a file with SAF
          fileUri = await FileSystem.StorageAccessFramework.createFileAsync(downloadDir, fileName, mimeType);
          // Write to the file
          await FileSystem.writeAsStringAsync(fileUri, fileData, {
            encoding: FileSystem.EncodingType.Base64
          });
          console.log("File saved to SAF URI:", fileUri);
        } catch (error) {
          console.error("Error writing to SAF:", error);
          throw error;
        }
      } else {
        // For iOS or Android fallback to app storage
        const fileName = `${sanitizedTitle}_${Date.now()}.${fileExtension}`;
        fileUri = `${downloadDir}${fileName}`;

        // Write the file
        await FileSystem.writeAsStringAsync(fileUri, Buffer.from(response.data).toString("base64"), {
          encoding: FileSystem.EncodingType.Base64
        });
        console.log("File saved to:", fileUri);
      }

      // For video downloads, save to gallery
      let finalFileUri = fileUri;
      if (option === "video" && hasMediaPermission) {
        try {
          finalFileUri = await saveFileToGallery(fileUri);
          console.log("Video saved to gallery:", finalFileUri);
        } catch (error) {
          console.error("Failed to save to gallery, using file URI instead:", error);
        }
      }

      // Create download record
      const newDownloadRecord = {
        id: downloadId,
        title: selectedVideo.title,
        Poster: selectedVideo.poster,
        fileUri: finalFileUri,
        type: option,
        source: "direct",
        downloadedAt: Date.now()
      };

      // Save to AsyncStorage
      await addDownloadRecord(newDownloadRecord);

      // Update UI state
      setCompleteDownloads(prev => [...prev, { id: downloadId, title: `${option.toUpperCase()} Download Complete` }]);
      setActiveDownloads((prev: Record<string, ActiveDownload>) => {
        const { [downloadId]: removed, ...rest } = prev;
        return rest;
      });

      // Show success message with open option
      Alert.alert("Success", `${option.toUpperCase()} download complete.`, [
        { text: "OK" },
        {
          text: "Open File",
          onPress: async () => {
            console.log("Opening file:", finalFileUri);
            await openFile(finalFileUri);
          }
        }
      ]);
    } catch (error: any) {
      console.error("Download Error:", error);
      Alert.alert(
        "Download Failed",
        error.response?.data?.message || error.message || "Failed to download. Please try again."
      );
      setActiveDownloads((prev: Record<string, ActiveDownload>) => {
        const { [downloadId]: removed, ...rest } = prev;
        return rest;
      });
    } finally {
      setModalVisible(false);
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
                {item.Formats.length > 0 ? (
                  item.Formats.map(format => (
                    <TouchableOpacity key={format.id} style={styles.button} onPress={() => handleLinks(format.id)}>
                      <Text style={styles.listTitle}>
                        {format.quality} ({format.size}) - {format.format}
                      </Text>
                    </TouchableOpacity>
                  ))
                ) : (
                  <Text style={styles.noFormatsText}>No formats available</Text>
                )}{" "}
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
