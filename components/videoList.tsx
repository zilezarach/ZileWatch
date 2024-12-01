import React from "react";

import { FlatList, Text } from "react-native";

import VideoCard from "./videoCard";

type Video = {
  id: string;
  snippet: {
    title: string;
    thumbnails: {
      medium: { url: string };
    };
  };
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
      renderItem={({ item }) => (
        <VideoCard
          title={item.snippet.title || "untitled"}
          thumbnail={item.snippet.thumbnails.medium.url}
          videoUrl={`https://www.youtube.com/watch?v=${item.id}`}
          onDownload={() => onDownload(item.id)}
        />
      )}
    />
  );
};

export default VideoList;
