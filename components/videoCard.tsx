import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { useNavigation } from "expo-router";

type VideoCardProps = {
  title: string;
  thumbnail: string;
  onDownload: () => void;
  videoUrl: string;
};

const { width } = Dimensions.get("window");

const VideoCard: React.FC<VideoCardProps> = ({ title, thumbnail, onDownload, videoUrl }) => {
  const navigation = useNavigation();

  const handlePlay = () => {
    navigation.navigate("videoPlayer", { videoUrl });
  };

  return (
    <View style={styles.card}>
      <Image source={{ uri: thumbnail }} style={styles.thumbnail} />
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      <View style={styles.actions}>
        <TouchableOpacity onPress={onDownload} style={styles.downloadButton}>
          <Text style={styles.textdown}>Download</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.playButton} onPress={handlePlay}>
          <Text style={styles.textButton}>Play</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 20,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#fff",
    elevation: 3
  },
  textButton: {
    textAlign: "center",
    color: "#fff"
  },
  thumbnail: {
    height: width * 0.56,
    width: "100%"
  },
  playButton: {
    borderRadius: 5,
    borderColor: "#7d0b02",
    backgroundColor: "#7d0b02",
    padding: 10,
    margin: 11
  },
  actions: {
    flexDirection: "column",
    marginRight: 5,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  title: {
    fontWeight: "bold",
    marginVertical: 10,
    fontSize: 15
  },
  downloadButton: {
    padding: 10,
    margin: 10,
    borderRadius: 5,
    borderColor: "#7d0b02",
    backgroundColor: "#7d0b02"
  },
  textdown: {
    textAlign: "center",
    color: "#fff"
  }
});

export default VideoCard;
