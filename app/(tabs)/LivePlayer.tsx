import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar,
  Dimensions,
  ActivityIndicator,
  Platform,
  BackHandler,
  Animated,
} from "react-native";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as ScreenOrientation from "expo-screen-orientation";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { RootStackParamList } from "../../types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "LivePlayer">;

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

export default function PlayerScreen({ navigation }: Props) {
  const { title = "", url = "" } = useLocalSearchParams<{
    title: string;
    url: string;
  }>();
  const router = useRouter();
  const videoRef = useRef<Video>(null);
  const isFocused = useIsFocused();

  const [status, setStatus] = useState<AVPlaybackStatus | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const controlsOpacity = useRef(new Animated.Value(1)).current;

  // Auto-hide controls
  useEffect(() => {
    if (status && status.isLoaded && status.isPlaying && showControls) {
      const timer = setTimeout(hideControls, 3000);
      return () => clearTimeout(timer);
    }
  }, [status, showControls]);

  const hideControls = () => {
    Animated.timing(controlsOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => setShowControls(false));
  };

  const showAndResetControls = () => {
    setShowControls(true);
    Animated.timing(controlsOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  // Handle orientation
  useEffect(() => {
    let subscription: ScreenOrientation.Subscription;
    (async () => {
      const orientation = await ScreenOrientation.getOrientationAsync();
      handleOrientation(orientation);
    })();
    subscription = ScreenOrientation.addOrientationChangeListener(
      ({ orientationInfo }) => handleOrientation(orientationInfo.orientation),
    );
    return () => subscription.remove();
  }, []);

  const handleOrientation = (orientation: number) => {
    const landscape =
      orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
      orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
    setIsFullscreen(landscape);
    StatusBar.setHidden(landscape, "slide");
  };

  // Pause when navigating away
  useEffect(() => {
    if (!isFocused && status && status.isLoaded && status.isPlaying) {
      videoRef.current?.pauseAsync();
    }
  }, [isFocused]);

  // Handle back button
  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        exitPlayer();
        return true;
      };
      BackHandler.addEventListener("hardwareBackPress", onBack);
      return () => BackHandler.removeEventListener("hardwareBackPress", onBack);
    }, []),
  );

  const exitPlayer = async () => {
    try {
      await videoRef.current?.pauseAsync();
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP,
      );
    } catch {}
    router.back();
  };

  const onPlaybackStatusUpdate = (playbackStatus: AVPlaybackStatus) => {
    setStatus(playbackStatus);
  };

  const togglePlayPause = () => {
    if (status && status.isLoaded) {
      status.isPlaying
        ? videoRef.current?.pauseAsync()
        : videoRef.current?.playAsync();
      showAndResetControls();
    }
  };

  const toggleMute = () => {
    if (status && status.isLoaded) {
      videoRef.current?.setIsMutedAsync(!status.isMuted);
      showAndResetControls();
    }
  };

  const toggleFullscreen = () => {
    const lock = isFullscreen
      ? ScreenOrientation.OrientationLock.PORTRAIT_UP
      : ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT;
    ScreenOrientation.lockAsync(lock);
    showAndResetControls();
  };

  const seek = (value: number) => {
    videoRef.current?.setPositionAsync(value);
    showAndResetControls();
  };

  // Error fallback
  if (status && !status.isLoaded && "error" in status && status.error) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="warning-outline" size={64} color="#FF6B35" />
        <Text style={styles.errorText}>Unable to load stream.</Text>
        <Pressable onPress={exitPlayer} style={styles.errorButton}>
          <Text style={styles.errorButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Video
        ref={videoRef}
        source={{ uri: url }}
        style={styles.video}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay
        onPlaybackStatusUpdate={onPlaybackStatusUpdate}
        useNativeControls={false}
      />
      <Pressable style={styles.touchArea} onPress={showAndResetControls}>
        <Animated.View style={[styles.controls, { opacity: controlsOpacity }]}>
          <View style={styles.topBar}>
            <Pressable onPress={exitPlayer} style={styles.iconBtn}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </Pressable>
            <Text numberOfLines={1} style={styles.title}>
              {title}
            </Text>
            <Pressable onPress={toggleFullscreen} style={styles.iconBtn}>
              <Ionicons
                name={isFullscreen ? "contract" : "expand"}
                size={24}
                color="#fff"
              />
            </Pressable>
          </View>

          <View style={styles.centerBar}>
            {status && status.isLoaded && status.isBuffering && (
              <ActivityIndicator size="large" color="#FF6B35" />
            )}
            {status &&
              status.isLoaded &&
              !status.isPlaying &&
              !status.isBuffering && (
                <Pressable onPress={togglePlayPause} style={styles.playBtn}>
                  <Ionicons name="play" size={48} color="#fff" />
                </Pressable>
              )}
          </View>

          <View style={styles.bottomBar}>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={status?.isLoaded ? status.durationMillis : 0}
              value={status?.isLoaded ? status.positionMillis : 0}
              minimumTrackTintColor="#FF6B35"
              maximumTrackTintColor="#fff"
              thumbTintColor="#FF6B35"
              onSlidingComplete={seek}
            />
            <Pressable onPress={togglePlayPause} style={styles.iconBtn}>
              <Ionicons
                name={
                  status && status.isLoaded && status.isPlaying
                    ? "pause"
                    : "play"
                }
                size={24}
                color="#fff"
              />
            </Pressable>
            <Pressable onPress={toggleMute} style={styles.iconBtn}>
              <Ionicons
                name={
                  status && status.isLoaded && status.isMuted
                    ? "volume-mute"
                    : "volume-high"
                }
                size={24}
                color="#fff"
              />
            </Pressable>
          </View>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  video: { flex: 1, backgroundColor: "#000" },
  touchArea: StyleSheet.absoluteFillObject,
  controls: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 50 : 20,
    paddingHorizontal: 16,
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: Platform.OS === "ios" ? 20 : 12,
  },
  centerBar: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { flex: 1, color: "#fff", fontSize: 18, marginHorizontal: 12 },
  playBtn: {
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 50,
    padding: 20,
    elevation: 3,
  },
  iconBtn: { padding: 8, backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 20 },
  slider: { flex: 1, marginRight: 8 },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  errorText: { color: "#fff", fontSize: 18, marginTop: 16 },
  errorButton: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#FF6B35",
    borderRadius: 8,
  },
  errorButtonText: { color: "#fff", fontSize: 16 },
});
