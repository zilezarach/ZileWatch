import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";

type VideoCardProps = {
  title: string;
  thumbnail: string;
  onDownload: () => void;
};

const VideoCard: React.FC<VideoCardProps> = ({ title, thumbnail, onDownload }) => {
  return (
    <View style={styles.card}>
      <Image source={{ uri: thumbnail }} style={styles.thumbnail} />
      <Text style={styles.title}>{title}</Text>
      <TouchableOpacity onPress={onDownload} style={styles.downloadButton}>
        <Text style={styles.textdown}>Download</Text>
      </TouchableOpacity>
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
  thumbnail: {
    height: 200,
    width: "100%"
  },
  title: {
    fontWeight: "bold",
    marginVertical: 10,
    fontSize: 10
  },
  downloadButton: {
    padding: 10,
    margin: 10,
    borderRadius: 5
  },
  textdown: {
    textAlign: "center"
  }
});

export default VideoCard;
