import React, { useEffect, useRef, useState } from "react";
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  StatusBar,
  Animated,
} from "react-native";

import { useVideoPlayer, VideoView } from "expo-video";
import axios from "axios";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as ScreenOrientation from "expo-screen-orientation";
import { RootStackParamList } from "../../types/navigation";
import { SafeAreaView } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");
type StreamRouteProp = RouteProp<RootStackParamList, "Stream">;

export default function StreamVideo() {
  const route = useRoute<StreamRouteProp>();
  const navigation = useNavigation();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const {
    mediaType = "movie",
    id: movieId,
    videoTitle,
    slug,
    episodeId,
    useFallback = false,
    streamUrl: directStreamUrl,
  } = route.params;

  const BASE_URL = Constants.expoConfig?.extra?.API_Backend ?? "";

  const [availableSources, setAvailableSources] = useState<any[]>([]);
  const [sourceName, setSourceName] = useState<string>("");
  const [streamUrl, setStreamUrl] = useState<string>(directStreamUrl || "");
  const [isLoading, setLoading] = useState<boolean>(!Boolean(directStreamUrl));
  const [error, setError] = useState<string | null>(null);
  const [isLandscape, setIsLandscape] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loadingSourceId, setLoadingSourceId] = useState<string | null>(null);

  // Initialize expo-video player
  const player = useVideoPlayer(streamUrl, (p) => {
    p.loop = false;
    p.bufferOptions = {
      waitsToMinimizeStalling: true,
      preferredForwardBufferDuration: 30,
    };
  });

  // Handle stream changes
  useEffect(() => {
    if (streamUrl && player) {
      player.replace({
        uri: streamUrl,
        metadata: { title: videoTitle },
      });
      player.play();
    }
  }, [streamUrl]);

  // Orientation and Status Bar
  useEffect(() => {
    const sub = ScreenOrientation.addOrientationChangeListener((evt) => {
      const o = evt.orientationInfo.orientation;
      const land =
        o === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
        o === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
      setIsLandscape(land);
      StatusBar.setHidden(land);
    });
    return () => ScreenOrientation.removeOrientationChangeListener(sub);
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.container}>
        {!isLandscape && (
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.back}
            >
              <Ionicons name="chevron-back" size={26} color="#fff" />
            </TouchableOpacity>

            <Text style={styles.title} numberOfLines={1}>
              {videoTitle}
            </Text>
          </View>
        )}

        {/* VIDEO */}
        <View
          style={isLandscape ? styles.videoFullscreen : styles.videoWrapper}
        >
          {streamUrl ? (
            <VideoView
              player={player}
              style={styles.video}
              allowsFullscreen
              allowsPictureInPicture
              contentFit="contain"
            />
          ) : (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color="#FF5722" />
            </View>
          )}
        </View>

        {/* TOAST */}
        {toast && (
          <Animated.View style={[styles.toast, { opacity: fadeAnim }]}>
            <Text style={styles.toastText}>{toast}</Text>
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#000",
  },

  container: {
    flex: 1,
    backgroundColor: "#000",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#111",
  },

  back: {
    padding: 6,
    marginRight: 8,
  },

  title: {
    flex: 1,
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },

  /* VIDEO */
  videoWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },

  videoFullscreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    zIndex: 50,
  },

  video: {
    width: "100%",
    height: "100%",
  },

  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  /* SOURCES */
  sourceContainer: {
    padding: 14,
  },

  sourceHeader: {
    color: "#aaa",
    fontSize: 13,
    marginBottom: 10,
  },

  sourceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  sourceButton: {
    minWidth: 100,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: "#1f1f1f",
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  activeSource: {
    backgroundColor: "#FF5722",
  },

  sourceLabel: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },

  activeSourceText: {
    fontWeight: "700",
  },

  /* TOAST */
  toast: {
    position: "absolute",
    bottom: 40,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.9)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    zIndex: 100,
  },

  toastText: {
    color: "#fff",
    fontSize: 14,
  },
});
