import React, { createContext } from "react";
import * as FileSystem from "expo-file-system";

type ActiveDownload = { title: string; progress: number };
type CompletedDownload = { id: string; title: string };

export type DownloadContextType = {
  activeDownloads: Record<string, ActiveDownload>;
  setActiveDownloads: React.Dispatch<
    React.SetStateAction<Record<string, ActiveDownload>>
  >;
  completeDownloads: CompletedDownload[];
  setCompleteDownloads: React.Dispatch<
    React.SetStateAction<CompletedDownload[]>
  >;
  resumables: Record<string, FileSystem.DownloadResumable>;
  setResumables: React.Dispatch<
    React.SetStateAction<Record<string, FileSystem.DownloadResumable>>
  >;
};

export const DownloadContext = createContext<DownloadContextType>({
  activeDownloads: {},
  setActiveDownloads: () => console.warn("setActiveDownloads not initialized!"),
  completeDownloads: [],
  setCompleteDownloads: () =>
    console.warn("setCompleteDownloads not initialized!"),
  resumables: {},
  setResumables: () => console.warn("setResumables not initialized!"),
});
