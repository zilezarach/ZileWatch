import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  Dimensions,
  Pressable,
  Alert,
  Platform,
  Modal,
  BackHandler,
} from "react-native";
import Video, { VideoRef } from "react-native-video";
import axios from "axios";
import {
  useRoute,
  RouteProp,
  useNavigation,
  useFocusEffect,
} from "@react-navigation/native";
import { RootStackParamList } from "@/types/navigation";
import Constants from "expo-constants";
import * as ScreenOrientation from "expo-screen-orientation";
import { Ionicons } from "@expo/vector-icons";
import { useMiniPlayer } from "../../context/MiniPlayerContext";
import { Buffer } from "buffer";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";

const TVEventHandler = (require("react-native") as any).TVEventHandler;

const { width, height } = Dimensions.get("window");

export default function VideoPlayer() {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isLandscape, setLandscape] = useState<boolean>(false);
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  const route = useRoute<RouteProp<RootStackParamList, "VideoPlayer">>();
  const navigation = useNavigation();
  const videoRef = useRef<VideoRef>(null);

  const DOWNLOADER_API = Constants.expoConfig?.extra?.API_Backend;
  const videoUrl = route?.params?.videoUrl?.trim?.() ?? "";
  const { miniPlayer, setMiniPlayer } = useMiniPlayer();

  // Handle Back Press
  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        handleClose();
        return true;
      };
      BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () =>
        BackHandler.removeEventListener("hardwareBackPress", onBackPress);
    }, [])
  );

  // Pause on blur
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", () => {
      if (videoRef.current) {
        videoRef.current.dismissFullscreenPlayer?.();
        setPaused(true);
        setStreamUrl(null);
      }
    });
    return unsubscribe;
  }, [navigation]);

  // Fetch stream URL
  useEffect(() => {
    (async () => {
      try {
        const response = await axios.get(`${DOWNLOADER_API}/stream-videos`, {
          params: { url: videoUrl },
        });

        if (response.data.success) {
          if (
            response.data.type === "progressive" ||
            response.data.type === "hls"
          ) {
            setStreamUrl(response.data.streamUrl);
          } else if (response.data.type === "separate_streams") {
            // Not directly playable
            setError(
              "This video uses separate video/audio streams and cannot be streamed directly. Please download instead."
            );
          } else {
            setError("Unsupported stream type returned from server.");
          }
        } else {
          setError(response.data.message || "Failed to load video");
        }
      } catch (err) {
        console.error("Stream fetch error:", err);
        setError("Error fetching stream URL");
      } finally {
        setLoading(false);
      }
    })();
  }, [videoUrl]);

  // Screen orientation
  useEffect(() => {
    const updateOrientation = async () => {
      const orientation = await ScreenOrientation.getOrientationAsync();
      const isLand = [
        ScreenOrientation.Orientation.LANDSCAPE_LEFT,
        ScreenOrientation.Orientation.LANDSCAPE_RIGHT,
      ].includes(orientation);
      setLandscape(isLand);
      if (Platform.OS === "ios" && videoRef.current) {
        if (isLand) videoRef.current.presentFullscreenPlayer?.();
        else videoRef.current.dismissFullscreenPlayer?.();
      }
    };
    updateOrientation();
    const sub = ScreenOrientation.addOrientationChangeListener((evt) => {
      const ori = evt.orientationInfo.orientation;
      const land = [
        ScreenOrientation.Orientation.LANDSCAPE_LEFT,
        ScreenOrientation.Orientation.LANDSCAPE_RIGHT,
      ].includes(ori);
      setLandscape(land);
      if (Platform.OS === "ios" && videoRef.current) {
        land
          ? videoRef.current.presentFullscreenPlayer?.()
          : videoRef.current.dismissFullscreenPlayer?.();
      }
    });
    return () => ScreenOrientation.removeOrientationChangeListener(sub);
  }, []);

  // TV remote button handling
  useEffect(() => {
    const tvHandler = new TVEventHandler();
    tvHandler.enable(null, (_cmp: any, evt: any) => {
      if (!evt) return;
      if (evt.eventType === "playPause") togglePlaypause();
      if (evt.eventType === "menu") handleClose();
    });
    return () => tvHandler.disable();
  }, []);

  const handleClose = () => {
    videoRef.current?.dismissFullscreenPlayer?.();
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
    navigation.goBack();
  };

  const [isPaused, setPaused] = useState(false);
  const togglePlaypause = () => setPaused((prev) => !prev);

  const returnToFullScreen = () =>
    videoRef.current?.presentFullscreenPlayer?.();

  const toggleMiniPlayer = async () => {
    if (!miniPlayer.visible) {
      let pos = 0;
      if (videoRef.current?.getCurrentPosition) {
        try {
          pos = await videoRef.current.getCurrentPosition();
        } catch {}
      }
      setMiniPlayer((prev) => ({
        ...prev,
        visible: true,
        videoUrl: streamUrl,
        videoCurrent: pos,
        title: "Now Playing",
      }));
    } else {
      setMiniPlayer((prev) => ({ ...prev, visible: false }));
    }
  };

  const handleDownloadOption = async (option: "video" | "audio") => {
    setDownloadModalVisible(false);
    setLoading(true);
    try {
      const format = option === "video" ? "best" : "bestaudio";
      const response = await axios.post(
        `${DOWNLOADER_API}/download-videos`,
        { url: videoUrl, format },
        { responseType: "arraybuffer" }
      );
      const downloadDir = `${FileSystem.documentDirectory}Downloads/`;
      const info = await FileSystem.getInfoAsync(downloadDir);
      if (!info.exists)
        await FileSystem.makeDirectoryAsync(downloadDir, {
          intermediates: true,
        });
      const ext = option === "video" ? "mp4" : "m4a";
      const fileName = `ZileWatch_${option}_${Date.now()}.${ext}`;
      const fileUri = `${downloadDir}${fileName}`;
      const base64 = Buffer.from(response.data).toString("base64");
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === "granted") {
        const asset = await MediaLibrary.createAssetAsync(fileUri);
        await MediaLibrary.createAlbumAsync(
          option === "video" ? "ZileWatch Videos" : "ZileWatch Audio",
          asset,
          false
        );
      }
      Alert.alert("Download Complete", `${option} saved successfully.`);
    } catch {
      Alert.alert("Error", "Download failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Loader / Error states
  if (loading)
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#7d0b02" />
        <Text style={styles.loaderText}>Loading Video...</Text>
      </View>
    );
  if (error || !streamUrl)
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error || "Failed to load video"}</Text>
      </View>
    );

  const videoStyle =
    Platform.OS === "android" && isLandscape
      ? [styles.video, styles.fullscreenVid]
      : styles.video;

  return (
    <View style={styles.container}>
      {/* Header controls */}
      <View style={styles.header}>
        <Pressable
          nativeID="miniBtn"
          focusable
          hasTVPreferredFocus
          onFocus={() => setFocused("mini")}
          onBlur={() => setFocused(null)}
          style={[
            styles.headerButton,
            focused === "mini" && styles.headerButtonFocused,
          ]}
          onPress={toggleMiniPlayer}
        >
          <Ionicons name="contract" size={24} color="#fff" />
        </Pressable>
        <Pressable
          nativeID="playBtn"
          focusable
          onFocus={() => setFocused("play")}
          onBlur={() => setFocused(null)}
          style={[
            styles.headerButton,
            focused === "play" && styles.headerButtonFocused,
          ]}
          onPress={togglePlaypause}
        >
          <Ionicons name={isPaused ? "play" : "pause"} size={24} color="#fff" />
        </Pressable>
        <Pressable
          nativeID="expandBtn"
          focusable
          onFocus={() => setFocused("expand")}
          onBlur={() => setFocused(null)}
          style={[
            styles.headerButton,
            focused === "expand" && styles.headerButtonFocused,
          ]}
          onPress={returnToFullScreen}
        >
          <Ionicons name="expand" size={24} color="#fff" />
        </Pressable>
        <Pressable
          nativeID="closeBtn"
          focusable
          onFocus={() => setFocused("close")}
          onBlur={() => setFocused(null)}
          style={[
            styles.headerButton,
            focused === "close" && styles.headerButtonFocused,
          ]}
          onPress={handleClose}
        >
          <Ionicons name="close" size={24} color="#fff" />
        </Pressable>
      </View>

      {/* Video */}
      <View focusable style={styles.videoWrapper}>
        <Video
          source={{ uri: streamUrl! }}
          style={videoStyle}
          controls
          resizeMode="contain"
          paused={isPaused}
          ref={videoRef}
          onLoad={() => setLoading(false)}
        />
      </View>

      {/* Download Modal */}
      <Modal
        visible={downloadModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setDownloadModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Format</Text>
            <Pressable
              focusable
              hasTVPreferredFocus={true}
              onFocus={() => setFocused("vidOpt")}
              onBlur={() => setFocused(null)}
              style={[
                styles.optionModal,
                focused === "vidOpt" && styles.optionModalFocused,
              ]}
              onPress={() => handleDownloadOption("video")}
            >
              <Ionicons name="videocam" size={24} color="#fff" />
            </Pressable>
            <Pressable
              focusable
              onFocus={() => setFocused("audOpt")}
              onBlur={() => setFocused(null)}
              style={[
                styles.optionModal,
                focused === "audOpt" && styles.optionModalFocused,
              ]}
              onPress={() => handleDownloadOption("audio")}
            >
              <Ionicons name="musical-note" size={24} color="#fff" />
            </Pressable>
            <Pressable
              focusable
              onFocus={() => setFocused("closeOpt")}
              onBlur={() => setFocused(null)}
              style={[
                styles.optionModal,
                focused === "closeOpt" && styles.optionModalFocused,
              ]}
              onPress={() => setDownloadModalVisible(false)}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
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
    paddingVertical: 5,
  },
  headerButton: { padding: 10 },
  headerButtonFocused: {
    transform: [{ scale: 1.1 }],
    borderWidth: 2,
    borderColor: "#7d0b02",
    borderRadius: 4,
  },
  videoWrapper: { width: "100%", height: (width * 9) / 16 },
  video: { width: "100%", height: (width * 9) / 16, backgroundColor: "#000" },
  fullscreenVid: { position: "absolute", top: 0, bottom: 0, width, height },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  loaderText: { color: "#FFF", marginTop: 10 },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  errorText: { color: "red", fontSize: 16, fontWeight: "bold" },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.8)",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#1E1E1E",
    borderRadius: 10,
    padding: 20,
    alignItems: "center",
  },
  modalTitle: {
    fontWeight: "bold",
    fontSize: 14,
    color: "#7d0b02",
    marginBottom: 15,
  },
  optionModal: {
    backgroundColor: "#7d0b02",
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginVertical: 5,
    width: "100%",
    alignItems: "center",
  },
  optionModalFocused: {
    transform: [{ scale: 1.1 }],
    borderWidth: 2,
    borderColor: "#fff",
  },
});
