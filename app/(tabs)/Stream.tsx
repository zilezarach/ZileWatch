import React, { useEffect, useRef, useState } from "react";
import { TouchableOpacity, View, Text, StyleSheet, Alert, ActivityIndicator, Platform, Dimensions } from "react-native";
import Video, { VideoRef } from "react-native-video";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { RootStackParamList } from "@/types/navigation";
import Constants from "expo-constants";
import * as ScreenOrientation from "expo-screen-orientation";
import { Ionicons } from "@expo/vector-icons";
import { useMiniPlayer } from "../../context/MiniPlayerContext";

const StreamVideo = () => {
  const route = useRoute<RouteProp<RootStackParamList, "Stream">>();
  const { magnetLink, videoTitle } = route.params;
  const navigation = useNavigation();
  const videoRef = useRef<VideoRef>(null);
  const DOWNLOADER_API = Constants.expoConfig?.extra?.API_Backend;
  const encodedMagnetLink = encodeURIComponent(magnetLink);
  const streamUrl = `${DOWNLOADER_API}/stream-torrents?magnet=${encodedMagnetLink}`;
  const [isLoading, setLoading] = useState(true);
  const [isPlaying, setPlaying] = useState(true);
  const [isLandscape, setIsLandscape] = useState<boolean>(false);
  const { miniPlayer, setMiniPlayer } = useMiniPlayer();

  useEffect(() => {
    setLoading(false);
  }, []);

  //Loading the expo-screen-orientation

  useEffect(() => {
    const checkOrientation = async () => {
      const current = await ScreenOrientation.getOrientationAsync();
      if (
        current === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
        current === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
      ) {
        setIsLandscape(true);
      } else {
        setIsLandscape(false);
      }
    };

    checkOrientation();

    const subscription = ScreenOrientation.addOrientationChangeListener(evt => {
      const orientation = evt.orientationInfo.orientation;
      if (
        orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
        orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
      ) {
        setIsLandscape(true);
        // For iOS, trigger native fullscreen
        if (Platform.OS === "ios" && videoRef.current?.presentFullscreenPlayer) {
          videoRef.current.presentFullscreenPlayer();
        }
      } else if (
        orientation === ScreenOrientation.Orientation.PORTRAIT_UP ||
        orientation === ScreenOrientation.Orientation.PORTRAIT_DOWN
      ) {
        setIsLandscape(false);
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
    setPlaying(false);
    navigation.goBack();
  };

  const toggleMiniPlayer = () => {
    if (!miniPlayer.visible) {
      setMiniPlayer({ visible: true, videoUrl: streamUrl, title: videoTitle });
    } else {
      setMiniPlayer({ ...miniPlayer, visible: false });
    }
  };

  // Placeholder for download logic.
  const handleDownload = () => {
    Alert.alert("Download", "Download functionality to be implemented.");
  };

  if (isLoading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#7d0b02" />
        <Text style={styles.loaderText}>Loading Video...</Text>
      </View>
    );
  }
  const videoStyle = Platform.OS === "android" && isLandscape ? [styles.video, styles.fullscreenVideo] : styles.video;
  return (
    <View style={styles.container}>
      {/* Header Controls */}
      <View style={styles.header}>
        <TouchableOpacity onPress={toggleMiniPlayer} style={styles.headerButton}>
          <Ionicons name={miniPlayer.visible ? "expand" : "contract"} size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDownload} style={styles.headerButton}>
          <Ionicons name="download" size={24} color="#fff" />
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
        paused={!isPlaying}
        ref={videoRef}
        onError={error => {
          console.error("Streaming Error", error);
          Alert.alert("Error", "Unable to stream video.");
        }}
      />
      {miniPlayer.visible && (
        <View style={styles.miniPlayerOverlay}>
          <TouchableOpacity onPress={toggleMiniPlayer} style={styles.headerButton}>
            <Ionicons name="expand" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  video: {
    width: "100%",
    height: 300,
    backgroundColor: "#000"
  },
  fullscreenVideo: {
    position: "absolute",
    top: 0,
    left: 0,
    width: Dimensions.get("window").width,
    height: Dimensions.get("window").height
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000"
  },
  loaderText: { color: "#fff", marginTop: 10 },
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
  headerButton: { padding: 10 },
  miniPlayerOverlay: {
    position: "absolute",
    bottom: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-around",
    width: 160,
    zIndex: 4
  }
});

export default StreamVideo;
