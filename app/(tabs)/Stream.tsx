import React, { useRef, useState } from "react";
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

const StreamVideo = () => {
  const route = useRoute<RouteProp<RootStackParamList, "Stream">>();
  const [isLoading, setLoading] = useState(true);
  const [isPlaying, setPlaying] = useState(true); // Start playing by default
  const { magnetLink, videoTitle } = route.params;
  const navigation = useNavigation();
  const encodedMagnetLink = encodeURIComponent(magnetLink);
  console.log("Route params:", route.params);
  const streamUrl = `http://10.0.2.2:5000/stream?magnet=${encodedMagnetLink}`;
  //  const videoRef = useRef<VideoRef>();

  //Close the video Player
  const handleClose = () => {
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      {/* Close Button */}
      <TouchableOpacity style={styles.buttonClose} onPress={handleClose}>
        <Text style={styles.closeText}>X</Text>
      </TouchableOpacity>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  video: {
    width: "100%",
    height: 300,
    backgroundColor: "#000",
  },
  title: {
    fontSize: 15,
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
  buttonClose: {
    position: "absolute",
    top: 20,
    left: 20,
    backgroundColor: "#7d0b02",
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  closeText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#fff",
  },
});

export default StreamVideo;
