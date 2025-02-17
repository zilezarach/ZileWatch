// MiniPlayer.tsx
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import Video from "react-native-video";
import { Ionicons } from "@expo/vector-icons";
import { useMiniPlayer } from "../context/MiniPlayerContext";

const MiniPlayer = () => {
  const { miniPlayer, setMiniPlayer } = useMiniPlayer();

  if (!miniPlayer.visible || !miniPlayer.videoUrl) return null;

  return (
    <View style={styles.container}>
      <Video
        source={{ uri: miniPlayer.videoUrl }}
        style={styles.video}
        controls
        resizeMode="cover"
      />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {miniPlayer.title}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => setMiniPlayer({ ...miniPlayer, visible: false })}
        style={styles.closeButton}
      >
        <Ionicons name="close" size={24} color="#fff" />
      </TouchableOpacity>
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
    backgroundColor: "#000",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    zIndex: 1000,
  },
  video: {
    width: 120,
    height: 70,
    borderRadius: 5,
  },
  info: {
    flex: 1,
    marginHorizontal: 10,
  },
  title: {
    color: "#fff",
    fontSize: 16,
  },
  closeButton: {
    padding: 10,
  },
});

export default MiniPlayer;
