import React, { useState } from "react";
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import Video from "react-native-video";
import { RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "@/types/navigation";

type VideoStreamProps = {
  route: RouteProp<RootStackParamList, "Stream">;
};

const StreamVideo: React.FC<VideoStreamProps> = ({ route }) => {
  const [isLoading, setLoading] = useState(true);
  const [isPlaying, setPlaying] = useState(true); // Start playing by default
  const { magnetLink, videoTitle } = route.params;
  const encodedMagnetLink = encodeURIComponent(magnetLink);
  const streamUrl = `http://localhost:5000/stream?magnet=${encodedMagnetLink}`;

  return (
    <View style={styles.container}>
      {/* Video Title */}
      <Text style={styles.title}>{videoTitle}</Text>

      {/* Loading Indicator */}
      {isLoading && <ActivityIndicator size="large" color="#7d0b02" />}

      {/* Video Player */}
      <Video
        source={{ uri: streamUrl }}
        style={styles.video}
        controls
        resizeMode="contain"
        paused={!isPlaying}
        onLoad={() => setLoading(false)} // Hide loader when video is ready
        onError={(error) => {
          console.error("Streaming Error", error);
          Alert.alert("Error", "Unable to Stream");
        }}
      />

      {/* Play/Pause Button */}
      <TouchableOpacity
        style={styles.button}
        onPress={() => setPlaying(!isPlaying)}
      >
        <Text style={styles.buttonText}>{isPlaying ? "Pause" : "Play"}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  video: {
    width: "100%",
    height: 300,
    backgroundColor: "#000",
  },
  title: {
    fontSize: 18,
    color: "#7d0b02",
    marginBottom: 10,
    textAlign: "center", // Aligns text to the center
  },
  button: {
    marginTop: 20,
    padding: 10,
    backgroundColor: "#7d0b02",
    borderRadius: 5,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
  },
});

export default StreamVideo;
