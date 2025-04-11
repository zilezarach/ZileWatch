// utils/streamingService.ts
import axios, { AxiosError, AxiosRequestConfig } from "axios";
import Constants from "expo-constants";

// Configuration
const BASE_URL = Constants.expoConfig?.extra?.API_Backend;
const DEFAULT_TIMEOUT = 15_000; // Extended from 10s to 15s
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

// Define extended request config type with retry properties
interface ExtendedAxiosRequestConfig extends AxiosRequestConfig {
  _retry?: number;
  skipRetry?: boolean;
}

// Enhanced axios instance with retry logic
const api = axios.create({
  baseURL: BASE_URL,
  timeout: DEFAULT_TIMEOUT,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// Add retry interceptor
api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as ExtendedAxiosRequestConfig;

  // Skip retry if explicitly marked or config is missing
  if (!config || config?.skipRetry) {
    return Promise.reject(error);
  }

  // Initialize retry counter
  if (config._retry === undefined) {
    config._retry = 0;
  }

  // Determine if we should retry
  const shouldRetry =
    config._retry < MAX_RETRIES &&
    (error.code === "ETIMEDOUT" ||
      error.code === "ENETUNREACH" ||
      error.code === "ECONNABORTED" ||
      error.code === "ECONNRESET" ||
      (error.response &&
        (error.response.status >= 500 ||
          error.response.status === 429 ||
          error.response.status === 408)));

  if (shouldRetry) {
    config._retry += 1;

    // Exponential backoff with jitter
    const delay =
      RETRY_DELAY *
      Math.pow(1.5, config._retry - 1) *
      (0.75 + Math.random() * 0.5);
    console.log(
      `[API] Retry ${config._retry}/${MAX_RETRIES} for ${
        config.url
      } after ${delay.toFixed(0)}ms`
    );

    // Wait before retrying
    await new Promise((resolve) => setTimeout(resolve, delay));

    return api(config);
  }

  return Promise.reject(error);
});

// Type definitions
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
  type?: "movie" | "tvSeries";
}

interface ServerResponse {
  id: string;
  name: string;
  isVidstream?: boolean;
}

interface SourcesResponse {
  sources: Array<{ file: string; type: string }>;
  tracks?: Array<{
    file: string;
    label: string;
    kind: string;
    default?: boolean;
  }>;
  success?: boolean;
}

interface SearchResponse {
  items: Array<{
    id: string;
    title: string;
    poster?: string;
    slug?: string;
    stats?: {
      year?: string;
      duration?: string;
      rating?: string;
      seasons?: string;
    };
    type?: "movie" | "tvSeries";
  }>;
}

interface SeasonResponse {
  seasons: Season[];
  success?: boolean;
  slug?: string;
  title: string;
}

interface EpisodeResponse {
  episodes: Array<{
    id: string;
    number: number;
    title?: string;
    description?: string;
    img?: string;
  }>;
  success?: boolean;
}

// Utility function for slug formatting
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // Remove non-word characters
    .replace(/[\s_-]+/g, "-") // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ""); // Trim hyphens
}

// Ensure slug has proper "watch-" prefix for API calls
function formatWatchSlug(slug: string): string {
  return slug.startsWith("watch-") ? slug : `watch-${slug}`;
}

// Utility function to handle axios errors consistently
function handleApiError(error: unknown, customMessage: string): never {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const serverMessage =
      error.response?.data?.message || error.response?.data?.error;

    if (status === 404) {
      throw new Error(
        `Content not found: ${serverMessage || "Resource not available"}`
      );
    } else if (status === 429) {
      throw new Error("Too many requests. Please try again later.");
    } else if (status === 500) {
      throw new Error(`Server error (${status}): Please try again later.`);
    } else if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      throw new Error(
        "Connection timed out. Please check your internet connection."
      );
    }

    throw new Error(
      `${customMessage}: ${
        serverMessage || error.message || "Unknown API error"
      }`
    );
  }

  throw new Error(
    `${customMessage}: ${
      error instanceof Error ? error.message : "Unknown error"
    }`
  );
}

// 1) Search content
export async function searchContent(
  query: string,
  contentType?: "movie" | "tvSeries"
): Promise<SearchItem[]> {
  try {
    if (!query?.trim()) {
      return [];
    }

    const res = await api.get<SearchResponse>("/content", {
      params: { q: query },
    });

    if (!res.data?.items?.length) {
      return [];
    }

    const items: SearchItem[] = res.data.items.map((item) => ({
      id: item.id,
      title: item.title,
      slug: item.slug || slugify(item.title),
      poster: item.poster || "",
      stats: item.stats || {},
      type: item.type || (item.stats?.seasons ? "tvSeries" : "movie"),
    }));

    return contentType ? items.filter((i) => i.type === contentType) : items;
  } catch (error) {
    console.error("Search error:", error);
    // Return empty array instead of throwing for better UX during search
    return [];
  }
}

// 2) Movie streaming flow
export async function getMovieStreamingUrl(
  movieId: string,
  incomingSlug?: string
): Promise<StreamingInfo> {
  try {
    // 1) Fetch movie details
    console.log(`[API] Fetching movie details for ID: ${movieId}`);
    const detail = await api.get<MovieDetailResponse>(
      `/movie/${incomingSlug ? `${incomingSlug}-${movieId}` : movieId}`
    );

    const { title, slug: returnedSlug, episodeId } = detail.data;

    if (!episodeId) {
      throw new Error(`No episode ID found for movie ${movieId} (${title})`);
    }

    // 2) Build slug for subsequent requests
    const baseSlug = incomingSlug || returnedSlug || slugify(title);
    const watchSlug = formatWatchSlug(baseSlug);

    // 3) Fetch servers
    console.log(
      `[API] Fetching servers for movie: ${watchSlug}-${movieId}, episodeId: ${episodeId}`
    );
    const srv = await api.get<{ servers: ServerResponse[]; success?: boolean }>(
      `/movie/${watchSlug}-${movieId}/servers`,
      { params: { episodeId } }
    );

    if (!srv.data.success || !srv.data.servers?.length) {
      throw new Error("No streaming servers available for this movie");
    }

    // 4) Select preferred server (VidCloud first, fallback to first available)
    const servers = srv.data.servers;
    const selectedServer =
      servers.find((s) => s.isVidstream === true) ||
      servers.find((s) => s.name.toLowerCase().includes("vidcloud")) ||
      servers[0];

    // 5) Fetch sources
    console.log(
      `[API] Fetching sources for movie: ${watchSlug}-${movieId}, server: ${selectedServer.name}`
    );
    const src = await api.get<SourcesResponse>(
      `/movie/${watchSlug}-${movieId}/sources`,
      { params: { episodeId, serverId: selectedServer.id } }
    );

    if (!src.data.success || !src.data.sources?.length) {
      throw new Error("No playable sources found for this movie");
    }

    // 6) Build streaming info response
    return {
      streamUrl: src.data.sources[0].file,
      subtitles:
        src.data.tracks?.map((track) => ({
          file: track.file,
          label: track.label || "Unknown",
          kind: track.kind || "subtitles",
          default: track.default,
        })) || [],
      selectedServer,
    };
  } catch (error) {
    return handleApiError(error, "Stream setup failed");
  }
}

// 2a) Fetch server list for an episode
export async function getEpisodeSources(
  seriesId: string,
  episodeId: string,
  slug?: string
): Promise<{ servers: ServerResponse[] }> {
  try {
    // If slug is provided, format it properly, otherwise just use seriesId
    const urlPath = slug
      ? `/movie/${formatWatchSlug(slug)}-${seriesId}/servers`
      : `/movie/${seriesId}/servers`;

    const res = await api.get<{ servers: ServerResponse[]; success?: boolean }>(
      urlPath,
      {
        params: { episodeId },
      }
    );

    if (!res.data.success || !res.data.servers?.length) {
      console.warn(`No servers returned for episode ${episodeId}`);
      return { servers: [] };
    }

    return { servers: res.data.servers };
  } catch (error) {
    console.error("Error fetching episode servers:", error);
    return { servers: [] };
  }
}

// 3) Get seasons list for a series
export async function getSeasons(
  seriesId: string,
  incomingSlug?: string
): Promise<Season[]> {
  try {
    if (!seriesId) {
      console.error("Series ID is required");
      return [];
    }

    // Validate and format the slug
    let baseSlug = incomingSlug || "";
    if (!baseSlug) {
      throw new Error(
        "Slug is required for season requests - provide slug or series title"
      );
    }

    // Clean existing watch- prefix if present
    baseSlug = baseSlug.replace(/^watch-/i, "");
    const watchSlug = formatWatchSlug(baseSlug);

    console.log(`[DEBUG] Fetching seasons at: ${watchSlug}-${seriesId}`);

    const res = await api.get<SeasonResponse>(
      `/movie/${watchSlug}-${seriesId}/seasons`
    );

    // Handle API response
    if (!res.data?.seasons?.length) {
      console.warn(`No seasons found for ${watchSlug}-${seriesId}`);
      return [];
    }

    return res.data.seasons.sort((a, b) => a.number - b.number);
  } catch (error) {
    console.error("Season fetch error:", error);
    return [];
  }
}
// 4) Get episodes for a season
export async function getEpisodesForSeason(
  seriesId: string,
  seasonId: string
): Promise<Episode[]> {
  try {
    if (!seasonId) {
      console.warn("Season ID is required");
      return [];
    }

    const res = await api.get<EpisodeResponse>(`/movie/${seriesId}/episodes`, {
      params: { seasonId },
    });

    if (!res.data.success || !res.data.episodes?.length) {
      console.warn(`No episodes found for season ${seasonId}`);
      return [];
    }

    return res.data.episodes.map((ep) => ({
      id: ep.id,
      number: ep.number,
      title: ep.title || `Episode ${ep.number}`,
      description: ep.description,
      img: ep.img,
    }));
  } catch (error) {
    console.error("Error fetching episodes:", error);
    return [];
  }
}

// 5) Episode → streaming flow
export async function getEpisodeStreamingUrl(
  seriesId: string,
  episodeId: string,
  serverId?: string
): Promise<StreamingInfo> {
  try {
    // Get series details for slug
    console.log(`[API] Fetching series details for ID: ${seriesId}`);
    const seriesDetail = await api.get<MovieDetailResponse>(
      `/movie/${seriesId}`
    );

    if (!seriesDetail.data) {
      throw new Error(`Series with ID ${seriesId} not found`);
    }

    const baseSlug =
      seriesDetail.data.slug || slugify(seriesDetail.data.title || "");
    const watchSlug = formatWatchSlug(baseSlug);

    // Fetch servers
    console.log(`[API] Fetching servers for episode ID: ${episodeId}`);
    const { servers } = await getEpisodeSources(seriesId, episodeId, baseSlug);

    if (!servers.length) {
      throw new Error("No streaming servers available for this episode");
    }

    // Select server based on preference
    const selectedServer = serverId
      ? servers.find((s) => s.id === serverId)
      : servers.find((s) => s.isVidstream === true) ||
        servers.find((s) => s.name.toLowerCase().includes("vidcloud")) ||
        servers[0];

    if (!selectedServer?.id) {
      throw new Error("Invalid server selection");
    }

    // Get sources
    console.log(
      `[API] Fetching sources for episode: ${episodeId}, server: ${selectedServer.name}`
    );
    const src = await api.get<SourcesResponse>(
      `/movie/${watchSlug}-${seriesId}/sources`,
      {
        params: {
          serverId: selectedServer.id,
          episodeId,
        },
      }
    );

    if (!src.data.success || !src.data.sources?.length) {
      throw new Error("No playable sources found for this episode");
    }

    // Decode URL if necessary
    const streamUrl = src.data.sources[0].file.includes("%")
      ? decodeURIComponent(src.data.sources[0].file)
      : src.data.sources[0].file;

    return {
      streamUrl,
      subtitles:
        src.data.tracks?.map((track) => ({
          file: track.file,
          label: track.label || "Unknown",
          kind: track.kind || "subtitles",
          default: track.default,
        })) || [],
      selectedServer,
    };
  } catch (error) {
    return handleApiError(error, "Episode stream setup failed");
  }
}

export default {
  searchContent,
  getMovieStreamingUrl,
  getEpisodeSources,
  getSeasons,
  getEpisodesForSeason,
  getEpisodeStreamingUrl,
  slugify,
};
