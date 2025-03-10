import React, { createContext, useContext, useState } from "react";

export type MiniPlayerState = {
  visible: boolean;
  videoUrl: string | null;
  title: string;
  mediaType: string;
  id: number;
  quality: string;
  sourceId: string;
};

type MiniPlayerContextType = {
  miniPlayer: MiniPlayerState;
  setMiniPlayer: React.Dispatch<React.SetStateAction<MiniPlayerState>>;
};

type Props = {
  children?: React.ReactNode;
};

const MiniPlayerContext = createContext<MiniPlayerContextType | undefined>(
  undefined
);

export const MiniPlayerProvider: React.FC<Props> = ({ children }) => {
  const [miniPlayer, setMiniPlayer] = useState<MiniPlayerState>({
    visible: false,
    videoUrl: null,
    title: "",
    mediaType: "",
    id: 0,
    quality: "",
    sourceId: "",
  });

  return (
    <MiniPlayerContext.Provider value={{ miniPlayer, setMiniPlayer }}>
      {children}
    </MiniPlayerContext.Provider>
  );
};

export const useMiniPlayer = () => {
  const context = useContext(MiniPlayerContext);
  if (!context) {
    throw new Error("useMiniPlayer must be used within a MiniPlayerProvider");
  }
  return context;
};
