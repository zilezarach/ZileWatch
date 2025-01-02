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
  onDownload: (videoId: string) => void;
};
const VideoList: React.FC<VideoListProps> = ({
  videos,
  onPlay,
  onDownload,
}) => {
  if (!videos || videos.length === 0) {
    return <Text>No videos available.</Text>;
  }
  return (
    <FlatList
      data={videos}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => {
        const thumbnail = item?.thumbnails?.medium?.url;
        return (
          <VideoCard
            title={item.title || "untitled"}
            thumbnail={thumbnail}
            videoUrl={`https://www.youtube.com/watch?v=${item.id}`}
            onDownload={() => onDownload(item.id)}
          />
        );
      }}
    />
  );
};

export default VideoList;
