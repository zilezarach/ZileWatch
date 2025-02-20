import React from "react";

import { FlatList, Text, StyleSheet } from "react-native";

import VideoCard from "./videoCard";

type Video = {
  id: string;
  title: string;
  thumbnails: {
    medium: { url: string };
  };
  description: string;
  channelTitle: string;
};

type VideoListProps = {
  videos: Video[];
  onPlay: (videoUrl: string) => void;
  onDownload: (video: { url: string; title: string; poster: string }) => void;
};
const VideoList: React.FC<VideoListProps> = ({ videos, onPlay, onDownload }) => {
  if (!videos || videos.length === 0) {
    return <Text style={styles.textModel}>No videos available, Check Internet Connection</Text>;
  }
  return (
    <FlatList
      data={videos}
      keyExtractor={item => item.id}
      renderItem={({ item }) => {
        const thumbnail = item?.thumbnails?.medium?.url;
        const videoUrl = `https://youtube.com/watch?v=${item.id}`;
        return (
          <VideoCard
            title={item.title || "untitled"}
            videoUrl={videoUrl}
            thumbnail={thumbnail}
            onDownload={() => onDownload({ url: videoUrl, title: item.title, poster: thumbnail || "" })}
            onPlay={() => onPlay(videoUrl)}
          />
        );
      }}
    />
  );
};

const styles = StyleSheet.create({
  textModel: {
    textAlign: "center",
    color: "#7d0b02",
    fontWeight: "bold"
  }
});

export default VideoList;
