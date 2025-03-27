import React, { createContext, useContext, useState, useRef, RefObject } from "react";

export type MiniPlayerState = {
  visible: boolean;
  videoUrl: string | null;
  title: string;
  mediaType: string;
  id: number;
  quality: string;
  sourceId: string;
  videoCurrent: number;
};

type MiniPlayerContextType = {
  miniPlayer: MiniPlayerState;
  setMiniPlayer: React.Dispatch<React.SetStateAction<MiniPlayerState>>;
  videoRef: VideoRefType | null;
  setVideoRef: (ref: RefObject<any>) => void;
};

type Props = {
  children?: React.ReactNode;
};

type VideoRefType = RefObject<{
  seekTo: (time: number) => void;
  play: () => void;
}>;

const MiniPlayerContext = createContext<MiniPlayerContextType | undefined>(undefined);

export const MiniPlayerProvider: React.FC<Props> = ({ children }) => {
  const [miniPlayer, setMiniPlayer] = useState<MiniPlayerState>({
    visible: false,
    videoUrl: null,
    title: "",
    mediaType: "",
    id: 0,
    quality: "",
    sourceId: "",
    videoCurrent: 0
  });

  const [videoRef, setVideoRefState] = useState<RefObject<any> | null>(null);

  const setVideoRef = (ref: RefObject<any>) => {
    setVideoRefState(ref);
  };

  const contextValue = {
    miniPlayer,
    setMiniPlayer,
    videoRef,
    setVideoRef
  };

  return <MiniPlayerContext.Provider value={contextValue}>{children}</MiniPlayerContext.Provider>;
};

export const useMiniPlayer = () => {
  const context = useContext(MiniPlayerContext);
  if (!context) {
    throw new Error("useMiniPlayer must be used within a MiniPlayerProvider");
  }
  return context;
};

// Helper function to handle mini player click and resume video
export const handleMiniPlayerClick = (miniPlayer: MiniPlayerState, videoRef: RefObject<any> | null) => {
  if (videoRef?.current && miniPlayer.videoCurrent) {
    try {
      // Seek to the saved position
      videoRef.current.seekTo(miniPlayer.videoCurrent);

      // Optional: Start playing if not already playing
      videoRef.current.play();
    } catch (error) {
      console.error("Error resuming video:", error);
    }
  }
};
