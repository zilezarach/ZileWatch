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
  type: "movie" | "tvSeries";
  slug: string;
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

interface MovieDetailResponse {
  title: string;
  episodeId?: string;
  slug?: string;
}

interface ServerResponse {
  id: string;
  name: string;
}

interface SourcesResponse {
  sources: Array<{ file: string; type: string }>;
  tracks?: Array<{ file: string; label: string; kind: string; default?: boolean }>;
}
//slug format
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // Remove non-word characters
    .replace(/[\s_-]+/g, "-") // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ""); // Trim hyphens
}

// 1) Search /content

export async function searchContent(query: string, contentType?: "movie" | "tvSeries"): Promise<SearchItem[]> {
  const res = await axios.get<{ items: any[] }>(`${BASE_URL}/content`, {
    params: { q: query },
    timeout: TIMEOUT
  });

  const items: SearchItem[] = res.data.items.map((item: any) => ({
    id: item.id,
    title: item.title,
    slug: slugify(item.title), // Add slug
    poster: item.poster,
    stats: item.stats,
    type: item.stats.seasons ? "tvSeries" : "movie"
  }));

  return contentType ? items.filter(i => i.type === contentType) : items;
}

// 2) Movie streaming flow

export async function getMovieStreamingUrl(movieId: string, incomingSlug?: string): Promise<StreamingInfo> {
  try {
    // 1) Fetch detail
    const detail = await axios.get<MovieDetailResponse>(`${BASE_URL}/movie/${incomingSlug}-${movieId}`, {
      timeout: TIMEOUT
    });
    const { title, slug: returnedSlug, episodeId } = detail.data;
    if (!episodeId) throw new Error(`No episodeId found for movie ${movieId}`);

    // 2) Build “watch-” slug
    const baseSlug = incomingSlug || returnedSlug || slugify(title);
    const slug = baseSlug.startsWith("watch-") ? baseSlug : `watch-${baseSlug}`;

    // 3) Log exactly what we’re calling
    console.log("→ GET servers:", {
      slug: slug,
      movieId: movieId,
      url: `${BASE_URL}/movie/${slug}-${movieId}/servers`,
      params: { episodeId }
    });

    // 4) Fetch servers
    const srv = await axios.get<{ servers: ServerResponse[] }>(`${BASE_URL}/movie/${slug}-${movieId}/servers`, {
      params: { episodeId },
      timeout: TIMEOUT
    });
    if (!srv.data.servers?.length) throw new Error("No streaming servers available");

    // 5) Pick server
    const selectedServer = srv.data.servers.find(s => s.name.toLowerCase().includes("vidcloud")) || srv.data.servers[0];

    // 6) Log sources call
    console.log("→ GET sources:", {
      url: `${BASE_URL}/movie/${slug}-${movieId}/sources`,
      params: { serverId: selectedServer.id, episodeId }
    });

    // 7) Fetch sources
    const src = await axios.get<SourcesResponse>(`${BASE_URL}/movie/${slug}-${movieId}/sources`, {
      params: { episodeId, serverId: selectedServer.id },
      timeout: TIMEOUT
    });
    if (!src.data.sources?.length) throw new Error("No playable sources found");

    return {
      streamUrl: src.data.sources[0].file,
      subtitles:
        src.data.tracks?.map(track => ({
          file: track.file,
          label: track.label,
          kind: track.kind,
          default: track.default
        })) || [],
      selectedServer
    };
  } catch (error) {
    throw new Error(`Stream setup failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
// 2a) Just fetch server list for an episode
export async function getEpisodeSources(seriesId: string, episodeId: string): Promise<{ servers: ServerResponse[] }> {
  const res = await axios.get<{ servers: any[] }>(`${BASE_URL}/movie/${seriesId}/servers`, {
    params: { episodeId },
    timeout: TIMEOUT
  });
  return { servers: res.data.servers || [] };
}

// 3) Series: seasons list
export async function getSeasons(seriesId: string): Promise<Season[]> {
  const res = await axios.get<{ seasons: Season[] }>(`${BASE_URL}/movie/${seriesId}/seasons`, { timeout: TIMEOUT });
  return res.data.seasons || [];
}

// 4) Series: episodes list
export async function getEpisodesForSeason(seriesId: string, seasonId: string): Promise<Episode[]> {
  const res = await axios.get<{ episodes: any[] }>(`${BASE_URL}/movie/${seriesId}/episodes`, {
    params: { seasonId },
    timeout: TIMEOUT
  });
  return res.data.episodes.map(ep => ({
    id: ep.id,
    number: ep.number,
    title: ep.title,
    description: ep.description,
    img: ep.img
  }));
}

// 5) Episode → streaming flow
export async function getEpisodeStreamingUrl(
  seriesId: string,
  episodeId: string,
  serverId?: string
): Promise<StreamingInfo> {
  try {
    // Get series details for slug
    const seriesDetail = await axios.get<MovieDetailResponse>(`${BASE_URL}/movie/${seriesId}`);
    const slug = seriesDetail.data.slug || slugify(seriesDetail.data.title);

    // Fetch servers with proper URL format
    const { servers } = await getEpisodeSources(seriesId, episodeId);
    if (!servers.length) throw new Error("No servers available");

    // Server selection logic
    const selectedServer = serverId
      ? servers.find(s => s.id === serverId)
      : servers.find(s => s.name.toLowerCase().includes("vidcloud")) || servers[0];

    if (!selectedServer?.id) throw new Error("Invalid server selection");

    // Get sources with proper URL format
    const src = await axios.get<SourcesResponse>(`${BASE_URL}/movie/${slug}-${seriesId}/sources`, {
      params: { serverId: selectedServer.id, episodeId }
    });

    if (!src.data.sources?.length) throw new Error("No sources available");
    const decodedStreamUrl = decodeURIComponent(src.data.sources[0].file);
    return {
      streamUrl: decodedStreamUrl,
      subtitles:
        src.data.tracks?.map(track => ({
          file: track.file,
          label: track.label,
          kind: track.kind,
          default: track.default
        })) || [],
      selectedServer
    };
  } catch (error) {
    throw new Error(`Episode stream setup failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
export default {
  searchContent,
  getMovieStreamingUrl,
  getEpisodeSources,
  getSeasons,
  getEpisodesForSeason,
  getEpisodeStreamingUrl,
  slugify
};
