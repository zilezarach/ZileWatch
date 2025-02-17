import React, { useState, useEffect, useContext } from "react";
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
import * as Sharing from "expo-sharing";

//Types
type Video = {
  Title: string;
  Plot: string;
  Formats: string[];
  Poster: string;
};
type ActiveDownload = {
  title: string;
  progress: number; // Progress in percentage
};

type CompletedDownload = {
  id: string;
  title: string;
};

export default function Home({ navigation }: any) {
  const [videos, setVideos] = useState([]);
  const [downloadVids, setDownloadVids] = useState<Video[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [isModalVisable, setModalVisable] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState("");
  const [isDarkMode, setisDarkMode] = useState<boolean>(true);
  const [isVisible, setVisible] = useState(false);
  const DOWNLOADER_API = Constants.expoConfig?.extra?.API_Backend;
  const { setActiveDownloads, setCompleteDownloads } =
    useContext(DownloadContext);

  //handle search function
  const handleSearch = async () => {
    if (!searchQuery) return;

    setLoading(true);
    const isURL =
      searchQuery.startsWith("http://") || searchQuery.startsWith("https://");

    if (isURL) {
      await fetchByUrl(searchQuery); // Fetch video details for direct URL
    } else {
      try {
        const results = await fetchYouTubeSearchResults(searchQuery); // Search for YouTube videos
        setVideos(results || []);
      } catch (error) {
        console.error("Error Fetching Videos", error);
      }
    }
    setLoading(false);
  };
  //Fetch Social Media
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

  const handleDownload = (videoId: string) => {
    setSelectedVideo(videoId);
    setModalVisable(true);
  };

  //Save file to Gallery
  const saveFileToGallery = async (fileUri: string) => {
    try {
      // Request permissions to access the media library
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Denied",
          "Cannot save file without permission."
        );
        return fileUri;
      }
      // Create an asset from the file
      const asset = await MediaLibrary.createAssetAsync(fileUri);
      // Create or add the asset to an album named "Downloads"
      const album = await MediaLibrary.getAlbumAsync("Downloads");
      if (album == null) {
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

  //handle Download Videos From Youtube
  const handleSelectOption = async (option: "audio" | "video") => {
    if (!selectedVideo) {
      Alert.alert("Error", "No video selected for download.");
      return;
    }
    setModalVisable(false);
    const downloadId = `${Date.now()}-${selectedVideo}`; // Unique ID for tracking

    const formatMapping: Record<string, string> = {
      video: "best",
      audio: "bestaudio",
    };

    const selectedFormat = formatMapping[option];

    try {
      // (Your progress update logic here, if any)
      const response = await axios({
        method: "post",
        url: `${DOWNLOADER_API}/download-videos`,
        data: { url: selectedVideo, format: selectedFormat },
        responseType: "arraybuffer",
        onDownloadProgress: (progressEvent) => {
          const total = progressEvent.total || 1;
          const progress = Math.round((progressEvent.loaded / total) * 100);
          // Update context or local state with progress if needed.
        },
      });

      // Define download folder (in app's sandbox)
      const downloadDir = `${FileSystem.documentDirectory}Downloads/`;
      const directoryInfo = await FileSystem.getInfoAsync(downloadDir);
      if (!directoryInfo.exists) {
        await FileSystem.makeDirectoryAsync(downloadDir, {
          intermediates: true,
        });
      }
      const rawName =
        selectedVideo.split("/").pop() || `${option.toUpperCase()}_download`;
      const fileName = `${downloadId}_${rawName}.${
        option === "audio" ? "m4a" : "mp4"
      }`;
      const fileUri = `${downloadDir}${fileName}`;
      const base64Data = Buffer.from(response.data).toString("base64");
      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Save the file to public storage using MediaLibrary.
      const publicFileUri = await saveFileToGallery(fileUri);

      // Build a download record.
      const newDownloadRecord = {
        id: downloadId,
        title: rawName,
        fileUri: publicFileUri, // Now points to a public asset URI.
        type: option,
        thumbnail: "", // Optionally, add a thumbnail if available.
        progress: 100,
        downloadedAt: Date.now(),
      };

      // Persist the record in AsyncStorage.
      const existingRecordsStr = await AsyncStorage.getItem("downloadedFiles");
      const existingRecords = existingRecordsStr
        ? JSON.parse(existingRecordsStr)
        : [];
      existingRecords.push(newDownloadRecord);
      await AsyncStorage.setItem(
        "downloadedFiles",
        JSON.stringify(existingRecords)
      );

      Alert.alert("Success", `${option.toUpperCase()} download complete.`);
    } catch (error: any) {
      console.error("Download Error:", error);
      Alert.alert(
        "Error",
        error.response?.data?.message || "Failed to download. Please try again."
      );
    } finally {
      setModalVisable(false);
    }
  };
  //handle links then downloaded
  const handleLinks = async (url: string) => {
    setLoading(true);
    try {
      await axios.post(`${DOWNLOADER_API}/download-videos`, {
        url,
      });
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
        <Switch value={isDarkMode} onValueChange={setisDarkMode} />
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
        visable={isModalVisable}
        onClose={() => setModalVisable(false)}
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
        transparent={true}
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.modalContainer}>
          {/* Close Button */}
          <TouchableOpacity
            style={styles.button}
            onPress={() => setVisible(false)}
          >
            <Text style={styles.buttonText}>Close</Text>
          </TouchableOpacity>

          {/* FlatList */}
          <FlatList
            data={downloadVids}
            keyExtractor={(item, index) => index.toString()}
            renderItem={({ item }) => (
              <View style={styles.listItem}>
                {/* Thumbnail */}
                <Image source={{ uri: item.Poster }} style={styles.thumbnail} />
                {/* Title */}
                <Text style={styles.listTitle}>{item.Title}</Text>
                {/* Formats */}
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
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)", // Semi-transparent background
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 40,
  },
  noFormatsText: {
    backgroundColor: "#7d0b02",
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
  contain: {
    flex: 1,
    padding: 10,
    borderWidth: 1,
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
    marginBottom: 5,
    marginTop: 5,
  },
  buttonText: {
    fontSize: 16,
  },
  darkMode: {
    backgroundColor: "#121212",
  },
  toggleContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  toggleLabel: {
    fontSize: 16,
    color: "#FFF",
  },
});
