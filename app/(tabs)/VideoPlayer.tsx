import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  Dimensions,
  TouchableOpacity,
  Alert,
  Platform,
  Modal,
  BackHandler
} from "react-native";
import Video, { VideoRef } from "react-native-video";
import axios from "axios";
import { useRoute, RouteProp, useNavigation, useFocusEffect } from "@react-navigation/native";
import { RootStackParamList } from "@/types/navigation";
import Constants from "expo-constants";
import * as ScreenOrientation from "expo-screen-orientation";
import { Ionicons } from "@expo/vector-icons";
import { useMiniPlayer } from "../../context/MiniPlayerContext";
import { Buffer } from "buffer";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { useIsFocused } from "@react-navigation/native";
const { width } = Dimensions.get("window");

const VideoPlayer = () => {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isLandscape, setLandscape] = useState<boolean>(false);
  const [downloadModalVisable, setDownloadModalVisable] = useState(false);
  const route = useRoute<RouteProp<RootStackParamList, "VideoPlayer">>();
  const videoRef = useRef<VideoRef>(null);
  const [isPaused, setPaused] = useState(false);
  const navigation = useNavigation();
  const DOWNLOADER_API = Constants.expoConfig?.extra?.API_Backend;
  const videoUrl = route?.params?.videoUrl?.trim?.() ?? "";
  const isFocused = useIsFocused();
  const { miniPlayer, setMiniPlayer } = useMiniPlayer();
  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        handleClose();
        return true;
      };

      BackHandler.addEventListener("hardwareBackPress", onBackPress);

      return () => {
        BackHandler.removeEventListener("hardwareBackPress", onBackPress);
      };
    }, [])
  );
  //Pause to lose screen Focus
  useEffect(() => {
    if (!isFocused && videoRef.current) {
      setPaused(true);
      setStreamUrl(null);
    }
  }, [isFocused]);

  // Clean up when component unmounts
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.dismissFullscreenPlayer?.();
        // Force pause the video when leaving
        setPaused(true);
        setStreamUrl(null);
      }
    };
  }, []);

  // Add navigation listener for when screen is unfocused
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", e => {
      // Pause and clean up video when navigating away
      if (videoRef.current) {
        videoRef.current.dismissFullscreenPlayer?.();
        setPaused(true);
        setStreamUrl(null);
      }
    });

    return unsubscribe;
  }, [navigation]);
  //fetch stream url
  useEffect(() => {
    const fetchStreamUrl = async () => {
      try {
        const response = await axios.get(`${DOWNLOADER_API}/stream-videos`, {
          params: { url: videoUrl }
        });
        setStreamUrl(response.data.streamUrl);
      } catch (err) {
        setError("Error fetching stream URL");
      } finally {
        setLoading(false);
      }
    };

    fetchStreamUrl();
  }, [videoUrl, DOWNLOADER_API]);

  //handle Screen Rotation

  useEffect(() => {
    const updateOrientation = async () => {
      const orientation = await ScreenOrientation.getOrientationAsync();
      if (
        orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
        orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
      ) {
        setLandscape(true);
      } else {
        setLandscape(false);
      }
    };

    updateOrientation();

    const subscription = ScreenOrientation.addOrientationChangeListener(evt => {
      const orientation = evt.orientationInfo.orientation;
      if (
        orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
        orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
      ) {
        setLandscape(true);
        // For iOS, use native fullscreen
        if (Platform.OS === "ios" && videoRef.current?.presentFullscreenPlayer) {
          videoRef.current.presentFullscreenPlayer();
        }
      } else if (
        orientation === ScreenOrientation.Orientation.PORTRAIT_UP ||
        orientation === ScreenOrientation.Orientation.PORTRAIT_DOWN
      ) {
        setLandscape(false);
        if (Platform.OS === "ios" && videoRef.current?.dismissFullscreenPlayer) {
          videoRef.current.dismissFullscreenPlayer();
        }
      }
    });

    return () => {
      ScreenOrientation.removeOrientationChangeListener(subscription);
    };
  }, []);

  const handleClose = () => {
    if (videoRef.current) {
      // Make sure to dismiss fullscreen player
      videoRef.current.dismissFullscreenPlayer?.();
      // Force pause the video
      setPaused(true);
      setStreamUrl(null);
    }

    // Return to portrait orientation before navigating back
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);

    // Navigate back
    navigation.goBack();
  };

  const togglePlaypause = () => {
    setPaused(prev => !prev);
  };

  const returnToFullScreen = () => {
    if (videoRef.current?.presentFullscreenPlayer) {
      videoRef.current.presentFullscreenPlayer();
    }
  };

  const openModal = () => {
    setDownloadModalVisable(true);
  };
  const toggleMiniPlayer = async () => {
    // When toggled, update the global mini player state.
    if (!miniPlayer.visible) {
      let videoCurrent = 0;

      try {
        // Await the getCurrentPosition if it returns a promise
        if (videoRef.current?.getCurrentPosition) {
          videoCurrent = await videoRef.current.getCurrentPosition();
        }
      } catch (error) {
        console.error("Error getting current position:", error);
        videoCurrent = 0;
      }

      setMiniPlayer(prev => ({
        ...prev, // Spread the previous state to include other required fields
        visible: true,
        videoUrl: streamUrl || null,
        videoCurrent: Number(videoCurrent) || 0, // Ensure it's a number
        title: "Now Playing"
      }));
    } else {
      setMiniPlayer(prev => ({ ...prev, visible: false }));
    }
  };
  const handleDownloadOption = async (option: "video" | "audio") => {
    setDownloadModalVisable(false);
    try {
      setLoading(true);
      // For video, use "best" format; for audio, "bestaudio"
      const format = option === "video" ? "best" : "bestaudio";
      const response = await axios({
        method: "post",
        url: `${DOWNLOADER_API}/download-videos`,
        data: { url: videoUrl, format },
        responseType: "arraybuffer",
        onDownloadProgress: progressEvent => {
          const total = progressEvent.total || 1;
          const progress = Math.round((progressEvent.loaded / total) * 100);
          console.log(`Downloading ${option}: ${progress}%`);
        }
      });

      // Ensure the download folder exists.
      const downloadDir = `${FileSystem.documentDirectory}Downloads/`;
      const directoryInfo = await FileSystem.getInfoAsync(downloadDir);
      if (!directoryInfo.exists) {
        await FileSystem.makeDirectoryAsync(downloadDir, {
          intermediates: true
        });
      }

      // Set the file extension based on type.
      const fileExtension = option === "video" ? "mp4" : "m4a";
      // Generate a sanitized filename.
      const fileName = `ZileWatch_${option}_${Date.now()}.${fileExtension}`;
      const fileUri = `${downloadDir}${fileName}`;

      // Convert the binary data to base64.
      const base64Data = Buffer.from(response.data).toString("base64");
      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64
      });

      // Request media library permission and add the file.
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === "granted") {
        const asset = await MediaLibrary.createAssetAsync(fileUri);
        const albumName = option === "video" ? "ZileWatch Videos" : "ZileWatch Audio";
        await MediaLibrary.createAlbumAsync(albumName, asset, false);
        Alert.alert("Download Complete", `Downloaded ${option} successfully. File added to ${albumName} album.`);
      } else {
        Alert.alert(
          "Download Complete",
          `Downloaded ${option} successfully, but media library permissions were not granted.`
        );
      }
    } catch (error) {
      console.error("Download error", error);
      Alert.alert("Error", "Download failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#7d0b02" />
        <Text style={styles.loaderText}>Loading Video...</Text>
      </View>
    );
  }

  if (error || !streamUrl) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error || "Failed to load video"}</Text>
      </View>
    );
  }
  const videoStyle = Platform.OS === "android" && isLandscape ? [styles.video, styles.fullscreenVid] : styles.video;

  return (
    <View style={styles.container}>
      {/* Header with controls */}
      <View style={styles.header}>
        <TouchableOpacity onPress={toggleMiniPlayer} style={styles.headerButton}>
          <Ionicons name="contract" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={togglePlaypause} style={styles.headerButton}>
          <Ionicons name={isPaused ? "play" : "pause"} size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={returnToFullScreen} style={styles.headerButton}>
          <Ionicons name="expand" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <Video
        source={{ uri: streamUrl }}
        style={videoStyle}
        controls
        resizeMode="contain"
        paused={false}
        ref={videoRef}
        onLoad={() => setLoading(false)}
      />

      {/*Download Modal*/}
      <Modal
        visible={downloadModalVisable}
        animationType="slide"
        transparent
        onRequestClose={() => setDownloadModalVisable(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Formats</Text>
            <TouchableOpacity onPress={() => handleDownloadOption("video")} style={styles.optionModal}>
              <Ionicons name="videocam" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDownloadOption("audio")} style={styles.optionModal}>
              <Ionicons name="musical-note" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDownloadModalVisable(false)} style={styles.optionModal}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center"
  },
  video: {
    width: "100%",
    height: (width * 9) / 16,
    backgroundColor: "#000"
  },
  modalTitle: {
    fontWeight: "bold",
    fontSize: 10,
    color: "#7d0b02",
    marginBottom: 15
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.8)",
    padding: 20
  },
  modalContent: {
    backgroundColor: "#1E1E1E",
    borderRadius: 10,
    padding: 20,
    alignItems: "center"
  },
  optionModal: {
    backgroundColor: "#7d0b02",
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginVertical: 5,
    width: "100%",
    alignItems: "center"
  },
  fullscreenVid: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: Dimensions.get("window").width,
    height: Dimensions.get("window").height
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000"
  },
  loaderText: { color: "#FFF", marginTop: 10 },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000"
  },
  errorText: { color: "red", fontSize: 16, fontWeight: "bold" },
  header: {
    position: "absolute",
    top: 20,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    zIndex: 3,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingVertical: 5
  },
  headerButton: { padding: 10 }
});

export default VideoPlayer;
