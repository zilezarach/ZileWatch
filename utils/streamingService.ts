import axios from "axios";
import Constants from "expo-constants";

const API_BASE = Constants.expoConfig?.extra?.API_Backend;
// e.g. "http://localhost:7474"

export interface SearchItem {
  title: string;
  id: number;
  stats?: any;
  overview?: string;
  poster?: string;
}
export interface StreamingInfo {
  streamUrl: string;
  selectedServer?: { id: string; name: string };
  subtitles?: Array<{ file: string; label?: string }>;
}
export interface SeriesInfo {
  details: {
    title: string;
    overview: string;
    poster?: string;
    stats?: { rating?: string };
  };
  seasons: Array<{
    id: number;
    number: number;
    name?: string;
    episode_count?: number;
  }>;
}

export default {
  // 1) search your backend
  async searchContent(
    q: string,
    type: "movie" | "series"
  ): Promise<SearchItem[]> {
    const resp = await axios.get<SearchItem[]>(`${API_BASE}/content`, {
      params: { q },
    });
    return resp.data;
  },

  // 2) movie HLS
  async getMovieStreamingInfo(movieId: string): Promise<StreamingInfo> {
    const { data } = await axios.get<{ hls: string }>(
      `${API_BASE}/movie/${movieId}/stream`
    );
    return {
      streamUrl: data.hls,
      selectedServer: { id: "auto", name: "vidcloud" },
      subtitles: [],
    };
  },

  // 3) episode HLS
  async getEpisodeStreamingInfo(
    tvId: string,
    episodeId: string
  ): Promise<StreamingInfo> {
    const { data } = await axios.get<{ hls: string }>(
      `${API_BASE}/movie/${tvId}/stream`,
      { params: { episodeId } }
    );
    return {
      streamUrl: data.hls,
      selectedServer: { id: "auto", name: "vidcloud" },
      subtitles: [],
    };
  },

  // 4) series details + seasons
  async getSeriesInfo(tvId: string): Promise<SeriesInfo> {
    const { data } = await axios.get<SeriesInfo>(`${API_BASE}/series/${tvId}`);
    return data;
  },

  // 5) season→episodes
  async getSeasonWithEpisodes(tvId: string, seasonId: string) {
    const { data } = await axios.get<{ episodes: any[] }>(
      `${API_BASE}/series/${tvId}/season/${seasonId}`
    );
    return data;
  },
};
