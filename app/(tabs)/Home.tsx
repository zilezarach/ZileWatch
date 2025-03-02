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
} from "react-native";
import {
  fetchPopularVids,
  fetchYouTubeSearchResults,
} from "@/utils/apiService";
import VideoList from "@/components/videoList";
import ModalPick from "@/components/DownloadPrompt";
import axios from "axios";
import { DownloadContext } from "./_layout";
import * as FileSystem from "expo-file-system";
import { Buffer } from "buffer";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as MediaLibrary from "expo-media-library";
import * as Linking from "expo-linking";
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
  const [hasMediaPermission, setHasMediaPermission] = useState<boolean>(false);
  const [isModalVisible, setModalVisible] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<SelectedVideo>({
    url: "",
    title: "",
    poster: "",
  });
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [isVisible, setVisible] = useState(false); // for paste link modal
  const DOWNLOADER_API = Constants.expoConfig?.extra?.API_Backend;
  const { setActiveDownloads, setCompleteDownloads } =
    useContext(DownloadContext);

  // Helper: Persist a new download record in AsyncStorage and update state.
  const addDownloadRecord = async (newRecord: any) => {
    try {
      const recordsStr = await AsyncStorage.getItem("downloadedFiles");
      let existingRecords = recordsStr ? JSON.parse(recordsStr) : [];
      // Prepend new record so that the newest appears first.
      const updatedRecords = [newRecord, ...existingRecords];
      await AsyncStorage.setItem(
        "downloadedFiles",
        JSON.stringify(updatedRecords)
      );
      // Optionally update local state if you want immediate feedback.
      // (If DownloadsScreen is separate, ensure it reloads on focus.)
    } catch (error) {
      console.error("Error saving download record:", error);
    }
  };
  //Loading the downloads when permission is made
  useEffect(() => {
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
          Alert.alert(
            "Permission Denied",
            "Cannot save files to gallery without permission."
          );
        }
      }
    })();
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
      setLoading(true);
      const res = await axios.get(`${DOWNLOADER_API}/download-videos`, {
        params: { url },
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
        Formats: formatsArray,
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
  const handleDownload = (video: {
    url: string;
    title: string;
    poster: string;
  }) => {
    setSelectedVideo(video);
    setModalVisible(true);
  };
  // Helper function to determine the proper storage directory
  const getStorageDirectory = async () => {
    if (Platform.OS === "ios") {
      return `${FileSystem.documentDirectory}ZileWatch/`;
    } else {
      try {
        // Check if we already have permissions stored
        const storedPermissions = await AsyncStorage.getItem(
          "storagePermissions"
        );

        if (storedPermissions) {
          return JSON.parse(storedPermissions).directoryUri;
        }

        // If no permissions stored, request them
        const permissions =
          await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

        if (permissions.granted) {
          // Store the permissions for future use
          await AsyncStorage.setItem(
            "storagePermissions",
            JSON.stringify(permissions)
          );
          return permissions.directoryUri;
        }
      } catch (error) {
        console.log("Could not access external storage directory", error);
      }

      // Fallback to app-specific storage
      return `${FileSystem.cacheDirectory}ZileWatch/`;
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
        Alert.alert("Error", "File not found or may have been deleted.");
        return;
      }

      // Platform-specific handling
      if (Platform.OS === "android") {
        try {
          // Try to get content URI first (needed for Android 10+ scoped storage)
          const contentUri = await FileSystem.getContentUriAsync(fileUri);

          // Try direct open with content URI
          const canOpen = await Linking.canOpenURL(contentUri);
          if (canOpen) {
            await Linking.openURL(contentUri);
            return;
          }

          // If can't open directly, try sharing
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri, {
              UTI: "public.item", // for iOS
              mimeType: fileUri.endsWith("mp4")
                ? "video/mp4"
                : "audio/mp4a-latm", // for Android
            });
            return;
          }
        } catch (error) {
          console.error("Error opening with content URI", error);
        }
      } else if (Platform.OS === "ios") {
        // iOS handling
        try {
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri);
            return;
          }
        } catch (error) {
          console.error("Error sharing on iOS", error);
        }
      }

      // Last resort: try direct linking
      try {
        await Linking.openURL(fileUri);
      } catch (linkError) {
        Alert.alert("Error", "No application available to open this file.");
      }
    } catch (error) {
      console.error("Error opening file", error);
      Alert.alert("Error", `Unable to open file`);
    }
  };
  // Download logic: called when user selects a download option from ModalPick.
  const handleSelectOption = async (option: "audio" | "video") => {
    if (!selectedVideo.url) {
      Alert.alert("Error", "No video selected for download.");
      return;
    }

    // Check permissions - both storage write and media library permissions
    if (Platform.OS === "android") {
      const storedPermissions = await AsyncStorage.getItem(
        "storagePermissions"
      );

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
      audio: "bestaudio",
    };
    const selectedFormat = formatMapping[option];

    try {
      //Check permissions--both storage write and read
      if (Platform.OS === "android") {
        const storagePermission = await MediaLibrary.requestPermissionsAsync();
        if (!storagePermission.granted) {
          Alert.alert(
            "Permission Required",
            "Storage permission is needed to save files."
          );
          return;
        }
      }

      // Add to active downloads context
      setActiveDownloads((prev: Record<string, ActiveDownload>) => ({
        ...prev,
        [downloadId]: { title: selectedVideo.title, progress: 0 },
      }));

      // Call the backend download endpoint
      const response = await axios({
        method: "post",
        url: `${DOWNLOADER_API}/download-videos`,
        data: { url: selectedVideo.url, format: selectedFormat },
        responseType: "arraybuffer",
        onDownloadProgress: (progressEvent) => {
          const total = progressEvent.total || 1;
          const progress = Math.round((progressEvent.loaded / total) * 100);
          setActiveDownloads((prev: Record<string, ActiveDownload>) => ({
            ...prev,
            [downloadId]: { ...prev[downloadId], progress },
          }));
        },
      });

      // Get appropriate storage directory
      const downloadDir = await getStorageDirectory();
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

        try {
          // Create a file with SAF
          fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
            downloadDir,
            fileName,
            option === "audio" ? "audio/mp4a-latm" : "video/mp4"
          );

          // Write to the file
          await FileSystem.writeAsStringAsync(fileUri, fileData, {
            encoding: FileSystem.EncodingType.Base64,
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

        // Ensure directory exists
        const directoryInfo = await FileSystem.getInfoAsync(downloadDir);
        if (!directoryInfo.exists) {
          await FileSystem.makeDirectoryAsync(downloadDir, {
            intermediates: true,
          });
        }

        // Write the file
        await FileSystem.writeAsStringAsync(
          fileUri,
          Buffer.from(response.data).toString("base64"),
          {
            encoding: FileSystem.EncodingType.Base64,
          }
        );

        console.log("File saved to:", fileUri);
      }

      // For video downloads, save to gallery
      let finalFileUri = fileUri;
      if (option === "video" && Platform.OS === "android") {
        try {
          finalFileUri = await saveFileToGallery(fileUri);
          console.log("Video saved to gallery:", finalFileUri);
        } catch (error) {
          console.error(
            "Failed to save to gallery, using file URI instead:",
            error
          );
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
        downloadedAt: Date.now(),
      };

      // Save to AsyncStorage
      const existingRecordsStr = await AsyncStorage.getItem("downloadedFiles");
      const existingRecords = existingRecordsStr
        ? JSON.parse(existingRecordsStr)
        : [];
      existingRecords.push(newDownloadRecord);
      await AsyncStorage.setItem(
        "downloadedFiles",
        JSON.stringify(existingRecords)
      );

      // Update UI state
      setCompleteDownloads((prev) => [
        ...prev,
        { id: downloadId, title: `${option.toUpperCase()} Download Complete` },
      ]);
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
          },
        },
      ]);
    } catch (error: any) {
      console.error("Download Error:", error);
      Alert.alert(
        "Error",
        error.response?.data?.message || "Failed to download. Please try again."
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
        <Image
          source={require("../../assets/images/Original.png")}
          style={{ width: 100, height: 100 }}
        />
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
      <VideoList
        videos={videos}
        onPlay={(videoUrl) => console.log("Play Video", videoUrl)}
        onDownload={handleDownload}
      />
      <ModalPick
        visable={isModalVisible}
        onClose={() => setModalVisible(false)}
        onSelect={handleSelectOption}
      />
      <TouchableOpacity
        style={styles.toggleButton}
        onPress={() => setVisible(!isVisible)}
      >
        <Text style={styles.toggleButtonText}>
          {isVisible ? "Hide List" : "Show Paste Link"}
        </Text>
      </TouchableOpacity>
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
                {Array.isArray(item.Formats) ? (
                  item.Formats.map((format, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.button}
                      onPress={() => handleLinks(format)}
                    >
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
    color: "#7d0b02",
  },
  contain: {
    flex: 1,
    padding: 10,
    borderWidth: 1,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    margin: 15,
    borderColor: "#7d0b02",
    borderRadius: 4,
    overflow: "hidden",
  },
  button: {
    backgroundColor: "#7d0b02",
    borderRadius: 5,
    padding: 10,
    marginVertical: 5,
    marginTop: 5,
  },
  buttonText: {
    fontSize: 16,
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
  toggleButton: {
    backgroundColor: "#7d0b02",
    padding: 10,
    borderRadius: 5,
    alignItems: "center",
    marginBottom: 10,
  },
  toggleButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  thumbnail: {
    height: 200,
    width: 200,
    borderRadius: 10,
    marginBottom: 10,
  },
  listContainer: {
    padding: 15,
  },
  listItem: {
    backgroundColor: "#f9f9f9",
    borderRadius: 10,
    padding: 10,
    marginVertical: 10,
    alignItems: "center",
  },
  listTitle: {
    marginTop: 5,
    marginBottom: 5,
  },
  noFormatsText: {
    backgroundColor: "#7d0b02",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 40,
  },
});
