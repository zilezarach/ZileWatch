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

const StreamVideo = () => {
  const route = useRoute<RouteProp<RootStackParamList, "Stream">>();
  const [isLoading, setLoading] = useState(true);
  const [isPlaying, setPlaying] = useState(true); // Start playing by default
  const { magnetLink, videoTitle } = route.params;
  const navigation = useNavigation();
  const videoRef = useRef<VideoRef>(null);
  const DOWNLOADER_API = Constants.expoConfig?.extra?.API_Backend;
  const encodedMagnetLink = encodeURIComponent(magnetLink);
  console.log("Route params:", route.params);
  const streamUrl = `${DOWNLOADER_API}/stream-torrents?magnet=${encodedMagnetLink}`;
  const [isMiniplayer, setMiniPlayer] = useState(false);
  //Close the video Player
  const handleClose = () => {
    setPlaying(false);
    navigation.goBack();
  };

  const toggleMiniplayer = () => {
    setMiniPlayer((prev) => !prev);
  };

  useEffect(() => {
    setLoading(false);
  }, []);

  useEffect(() => {
    const subscription = ScreenOrientation.addOrientationChangeListener(
      (evt) => {
        const orientation = evt.orientationInfo.orientation;
        // When landscape, present fullscreen.
        if (
          orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
          orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
        ) {
          if (videoRef.current?.presentFullscreenPlayer) {
            videoRef.current.presentFullscreenPlayer();
          }
        } else if (
          orientation === ScreenOrientation.Orientation.PORTRAIT_UP ||
          orientation === ScreenOrientation.Orientation.PORTRAIT_DOWN
        ) {
          // Optionally, exit fullscreen when back in portrait.
          if (videoRef.current?.dismissFullscreenPlayer) {
            videoRef.current.dismissFullscreenPlayer();
          }
        }
      }
    );
    return () => {
      ScreenOrientation.removeOrientationChangeListener(subscription);
    };
  }, []);
  if (isLoading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#7d0b02" />
        <Text style={styles.loaderText}>Loading Video ...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isMiniplayer && (
        <View>
          <Text style={styles.title}>{videoTitle}</Text>
          <View>
            <TouchableOpacity onPress={toggleMiniplayer}>
              <Text style={styles.buttonText}>MiniPlayer</Text>
            </TouchableOpacity>
            {/* Close Button */}
            <TouchableOpacity style={styles.buttonClose} onPress={handleClose}>
              <Ionicons name="close" color="#fff" size={24} />
            </TouchableOpacity>
          </View>
        </View>
      )}
      {/* Video Player */}
      <Video
        source={{ uri: streamUrl }}
        style={isMiniplayer ? styles.miniplayerVid : styles.video}
        controls
        resizeMode="contain"
        paused={!isPlaying}
        onLoad={() => setLoading(false)} // Hide loader when video is ready
        onError={(error) => {
          console.error("Streaming Error", error);
          Alert.alert("Error", "Unable to Stream");
        }}
      />
      {isMiniplayer && (
        <View style={styles.miniPlayerOver}>
          <TouchableOpacity style={styles.button} onPress={toggleMiniplayer}>
            <Ionicons name="expand" color="#fff" size={24} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleClose}>
            <Ionicons name="close" color="#fff" size={24} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  video: {
    width: "100%",
    height: 300,
    backgroundColor: "#000",
  },
  miniPlayerOver: {
    position: "absolute",
    bottom: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    width: 160,
    zIndex: 3,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  loaderText: {
    color: "#fff",
    marginTop: 10,
  },
  miniplayerVid: {
    position: "absolute",
    bottom: 20,
    right: 20,
    width: 160,
    height: 90,
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: "#7d0b02",
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
