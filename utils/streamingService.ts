// utils/streamingService.ts
import axios from "axios";
import Constants from "expo-constants";

const BASE_URL = Constants.expoConfig?.extra?.API_Backend;
const TIMEOUT = 10_000;

export interface SearchItem {
  id: string;
  title: string;
  poster: string;
  stats: {
    year?: string;
    duration?: string;
    rating?: string;
    seasons?: string;
  };
  type: "movie" | "series";
}

export interface StreamingInfo {
  streamUrl: string;
  subtitles: { file: string; label: string; kind: string; default?: boolean }[];
  selectedServer: { id: string; name: string };
}

export interface Season {
  id: string;
  number: number;
}

export interface Episode {
  id: string;
  number: number;
  title: string;
  description?: string;
  img?: string;
}

// 1) Search /content
export async function searchContent(
  query: string,
  contentType?: "movie" | "series"
): Promise<SearchItem[]> {
  const res = await axios.get<{ items: any[] }>(`${BASE_URL}/content`, {
    params: { q: query },
    timeout: TIMEOUT,
  });
  const items: SearchItem[] = res.data.items.map((item: any) => ({
    id: item.id,
    title: item.title,
    poster: item.poster,
    stats: item.stats,
    type: item.stats.seasons ? "series" : "movie",
  }));
  return contentType ? items.filter((i) => i.type === contentType) : items;
}

// 2) Movie streaming flow
export async function getMovieStreamingUrl(
  movieId: string
): Promise<StreamingInfo> {
  // 2.1) get episodeId
  const detail = await axios.get<any>(`${BASE_URL}/movie/${movieId}`, {
    timeout: TIMEOUT,
  });
  const episodeId = detail.data.episodeId;
  if (!episodeId) throw new Error(`No episodeId for movie ${movieId}`);

  // 2.2) get servers
  const srv = await axios.get<{ servers: any[] }>(
    `${BASE_URL}/movie/${movieId}/servers`,
    { params: { episodeId }, timeout: TIMEOUT }
  );
  const servers = srv.data.servers || [];
  if (!servers.length) throw new Error(`No servers for movie ${movieId}`);

  const selectedServer =
    servers.find((s) => s.name === "Vidcloud") || servers[0];
  if (!selectedServer?.id) throw new Error("Invalid server selected");

  // 2.3) get sources
  const src = await axios.get<any>(`${BASE_URL}/movie/${movieId}/sources`, {
    params: { serverId: selectedServer.id, episodeId },
    timeout: TIMEOUT,
  });
  const sources = src.data.sources;
  if (!sources?.length) throw new Error("No sources available");

  return {
    streamUrl: sources[0].file,
    subtitles: src.data.tracks || [],
    selectedServer,
  };
}

// 2a) Just fetch server list for an episode
export async function getEpisodeSources(
  seriesId: string,
  episodeId: string
): Promise<{ servers: any[] }> {
  const res = await axios.get<{ servers: any[] }>(
    `${BASE_URL}/movie/${seriesId}/servers`,
    { params: { episodeId }, timeout: TIMEOUT }
  );
  return { servers: res.data.servers || [] };
}

// 3) Series: seasons list
export async function getSeasons(seriesId: string): Promise<Season[]> {
  const res = await axios.get<{ seasons: Season[] }>(
    `${BASE_URL}/movie/${seriesId}/seasons`,
    { timeout: TIMEOUT }
  );
  return res.data.seasons || [];
}

// 4) Series: episodes list
export async function getEpisodesForSeason(
  seriesId: string,
  seasonId: string
): Promise<Episode[]> {
  const res = await axios.get<{ episodes: any[] }>(
    `${BASE_URL}/movie/${seriesId}/episodes`,
    { params: { seasonId }, timeout: TIMEOUT }
  );
  return res.data.episodes.map((ep) => ({
    id: ep.id,
    number: ep.number,
    title: ep.title,
    description: ep.description,
    img: ep.img,
  }));
}

// 5) Episode → streaming flow
export async function getEpisodeStreamingUrl(
  seriesId: string,
  episodeId: string,
  serverId?: string
): Promise<StreamingInfo> {
  // 5.1) get servers
  const { servers } = await getEpisodeSources(seriesId, episodeId);
  if (!servers.length) throw new Error("No servers available");

  const selectedServer = serverId
    ? servers.find((s) => s.id === serverId)
    : servers.find((s) => s.name === "Vidcloud") || servers[0];
  if (!selectedServer?.id) throw new Error("Invalid server selected");

  // 5.2) get sources
  const src = await axios.get<any>(`${BASE_URL}/movie/${seriesId}/sources`, {
    params: { serverId: selectedServer.id, episodeId },
    timeout: TIMEOUT,
  });
  const sources = src.data.sources;
  if (!sources?.length) throw new Error("No sources available");

  return {
    streamUrl: sources[0].file,
    subtitles: src.data.tracks || [],
    selectedServer,
  };
}

export default {
  searchContent,
  getMovieStreamingUrl,
  getEpisodeSources,
  getSeasons,
  getEpisodesForSeason,
  getEpisodeStreamingUrl,
};
