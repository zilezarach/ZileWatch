import React from "react";

import { FlatList } from "react-native";

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

const VideoList: React.FC<VideoListProps> = ({ videos, onPlay, onDownload }) => {
  return (
    <FlatList
      data={videos}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <VideoCard
          title={item.snippet.title}
          thumbnail={item.snippet.thumbnails.medium.url}
          videoUrl={`https://www.youtube.com/watch?v=${item.id}`}
          onDownload={() => onDownload(item.id)}
        />
      )}
    />
  );
};

export default VideoList;
