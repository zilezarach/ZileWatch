import React from "react";

import { FlatList } from "react-native";

import VideoCard from "./videoCard";

type VideoListProps = {
  videos: {
    id: string;
    snippet: {
      title: string;
      thumbnails: { medium: { url: string } };
    };
  }[];
  onDownload: (id: string) => void;
};

const VideoList: React.FC<VideoListProps> = ({ videos, onDownload }) => {
  if (!videos || videos.length === 0) return null;
  return (
    <FlatList
      data={videos}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <VideoCard
          title={item.snippet.title}
          thumbnail={item.snippet.thumbnails.medium.url}
          onDownload={() => onDownload(item.id)}
        />
      )
      }
    />
  );
};

export default VideoList;
