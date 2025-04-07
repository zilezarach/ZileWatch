import axios from "axios";
import Constants from "expo-constants";

// Replace with your API base URL
const BASE_URL = Constants.expoConfig?.extra?.API_Backend;

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

export interface Episode {
  id: string;
  number: number;
  title: string;
  description?: string;
  img?: string;
}

export interface Season {
  id: string;
  number: number;
}

// Search for content
async function searchContent(query: string, contentType?: "movie" | "series"): Promise<SearchItem[]> {
  try {
    const response = await axios.get(`${BASE_URL}/content`, {
      params: { q: query }
    });

    const items = response.data.items.map((item: any) => ({
      id: item.id,
      title: item.title,
      poster: item.poster,
      stats: item.stats,
      type: item.stats.seasons ? "series" : "movie"
    }));

    // Filter based on contentType if provided
    return contentType ? items.filter((item: SearchItem) => item.type === contentType) : items;
  } catch (error) {
    console.error("Search error:", error);
    throw error;
  }
}

// Get movie streaming URL
async function getMovieStreamingUrl(movieId: string): Promise<StreamingInfo> {
  try {
    // Get movie details
    const details = await axios.get(`${BASE_URL}/movie/${movieId}`);
    const episodeId = details.data.episodeId;

    // Get servers
    const serversRes = await axios.get(`${BASE_URL}/movie/${movieId}/servers`, {
      params: { episodeId }
    });

    const servers = serversRes.data.servers;
    const selectedServer = servers.find((s: any) => s.name === "Vidcloud") || servers[0];

    if (!selectedServer) throw new Error("No servers available");

    // Get sources
    const sourcesRes = await axios.get(`${BASE_URL}/movie/${movieId}/sources`, {
      params: { serverId: selectedServer.id }
    });

    const { sources, tracks } = sourcesRes.data;

    return {
      streamUrl: sources[0].file,
      subtitles: tracks || [],
      selectedServer
    };
  } catch (error) {
    console.error("Movie streaming error:", error);
    throw error;
  }
}

// Get series seasons
async function getSeasons(seriesId: string): Promise<Season[]> {
  try {
    const response = await axios.get(`${BASE_URL}/movie/${seriesId}/seasons`);
    return response.data.seasons;
  } catch (error) {
    console.error("Seasons fetch error:", error);
    throw error;
  }
}

// Get episodes for a season
async function getEpisodesForSeason(seriesId: string, seasonId: string): Promise<{ episodes: Episode[] }> {
  try {
    const response = await axios.get(`${BASE_URL}/movie/${seriesId}/episodes`, {
      params: { seasonId }
    });

    return {
      episodes: response.data.episodes.map((ep: any) => ({
        id: ep.id,
        number: ep.number,
        title: ep.title,
        description: ep.description,
        img: ep.img
      }))
    };
  } catch (error) {
    console.error("Episodes fetch error:", error);
    throw error;
  }
}

// Get episode streaming sources
async function getEpisodeSources(seriesId: string, episodeId: string): Promise<{ servers: any[] }> {
  try {
    const serversRes = await axios.get(`${BASE_URL}/movie/${seriesId}/servers`, {
      params: { episodeId }
    });

    return {
      servers: serversRes.data.servers
    };
  } catch (error) {
    console.error("Episode sources error:", error);
    throw error;
  }
}

// Get episode streaming URL
async function getEpisodeStreamingUrl(seriesId: string, episodeId: string, serverId?: string): Promise<StreamingInfo> {
  try {
    // Get servers
    const serversRes = await axios.get(`${BASE_URL}/movie/${seriesId}/servers`, {
      params: { episodeId }
    });

    const servers = serversRes.data.servers;
    const selectedServer = serverId
      ? servers.find((s: any) => s.id === serverId)
      : servers.find((s: any) => s.name === "Vidcloud") || servers[0];

    if (!selectedServer) throw new Error("No servers available");

    // Get sources
    const sourcesRes = await axios.get(`${BASE_URL}/movie/${seriesId}/sources`, {
      params: { serverId: selectedServer.id }
    });

    const { sources, tracks } = sourcesRes.data;

    if (!sources || sources.length === 0) {
      throw new Error("No sources available");
    }

    return {
      streamUrl: sources[0].file,
      subtitles: tracks || [],
      selectedServer
    };
  } catch (error) {
    console.error("Episode streaming error:", error);
    throw error;
  }
}

export default {
  searchContent,
  getMovieStreamingUrl,
  getSeasons,
  getEpisodesForSeason,
  getEpisodeSources,
  getEpisodeStreamingUrl
};
