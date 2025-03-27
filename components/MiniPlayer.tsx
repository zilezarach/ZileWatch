import React, { useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from "react-native";
import Video, { VideoRef } from "react-native-video";
import { Ionicons } from "@expo/vector-icons";
import { useMiniPlayer } from "../context/MiniPlayerContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const MiniPlayer = () => {
  const { miniPlayer, setMiniPlayer } = useMiniPlayer();
  const videoRef = useRef<VideoRef>(null);
  const [isPaused, setIsPaused] = useState(false);

  if (!miniPlayer.visible || !miniPlayer.videoUrl) return null;

  const togglePlayPause = () => {
    setIsPaused(prev => !prev);
  };

  const handleClose = () => {
    setMiniPlayer({ ...miniPlayer, visible: false });
  };

  const handleVideoEnd = () => {
    // Reset or close mini player when video ends
    setMiniPlayer({ ...miniPlayer, visible: false });
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.videoContainer} onPress={togglePlayPause}>
        <Video
          ref={videoRef}
          source={{ uri: miniPlayer.videoUrl }}
          style={styles.video}
          resizeMode="cover"
          paused={isPaused}
          onEnd={handleVideoEnd}
        />
        {isPaused && (
          <View style={styles.playOverlay}>
            <Ionicons name="play" size={30} color="#fff" />
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {miniPlayer.title}
        </Text>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity onPress={togglePlayPause} style={styles.controlButton}>
          <Ionicons name={isPaused ? "play" : "pause"} size={24} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity onPress={handleClose} style={styles.controlButton}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: "#1E1E1E",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    zIndex: 1000,
    borderTopWidth: 1,
    borderTopColor: "#333"
  },
  videoContainer: {
    position: "relative"
  },
  video: {
    width: 120,
    height: 70,
    borderRadius: 5
  },
  playOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)"
  },
  info: {
    flex: 1,
    marginHorizontal: 10
  },
  title: {
    color: "#fff",
    fontSize: 16,
    maxWidth: SCREEN_WIDTH - 250 // Adjust based on your layout
  },
  controls: {
    flexDirection: "row",
    alignItems: "center"
  },
  controlButton: {
    padding: 10
  }
});

export default MiniPlayer;
