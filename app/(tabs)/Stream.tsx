import React, { useEffect, useRef, useState } from "react";
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
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
  const { miniPlayer, setMiniPlayer } = useMiniPlayer();

  useEffect(() => {
    setLoading(false);
  }, []);

  useEffect(() => {
    const subscription = ScreenOrientation.addOrientationChangeListener(
      (evt) => {
        const orientation = evt.orientationInfo.orientation;
        if (
          orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
          orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
        ) {
          videoRef.current?.presentFullscreenPlayer();
        } else if (
          orientation === ScreenOrientation.Orientation.PORTRAIT_UP ||
          orientation === ScreenOrientation.Orientation.PORTRAIT_DOWN
        ) {
          videoRef.current?.dismissFullscreenPlayer();
        }
      }
    );
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

  return (
    <View style={styles.container}>
      {/* Header Controls */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={toggleMiniPlayer}
          style={styles.headerButton}
        >
          <Ionicons
            name={miniPlayer.visible ? "expand" : "contract"}
            size={24}
            color="#fff"
          />
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
        style={miniPlayer.visible ? styles.miniplayerVideo : styles.video}
        controls
        resizeMode="contain"
        paused={!isPlaying}
        ref={videoRef}
        onError={(error) => {
          console.error("Streaming Error", error);
          Alert.alert("Error", "Unable to stream video.");
        }}
      />
      {miniPlayer.visible && (
        <View style={styles.miniPlayerOverlay}>
          <TouchableOpacity
            onPress={toggleMiniPlayer}
            style={styles.headerButton}
          >
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
    backgroundColor: "#000",
  },
  miniplayerVideo: {
    position: "absolute",
    bottom: 20,
    right: 20,
    width: 160,
    height: 90,
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: "#7d0b02",
    zIndex: 2,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
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
    paddingVertical: 5,
  },
  headerButton: { padding: 10 },
  miniPlayerOverlay: {
    position: "absolute",
    bottom: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-around",
    width: 160,
    zIndex: 4,
  },
});

export default StreamVideo;
