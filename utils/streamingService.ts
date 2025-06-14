import axios, { AxiosError, AxiosRequestConfig } from "axios";
import Constants from "expo-constants";

// Configuration
const BASE_URL = Constants.expoConfig?.extra?.API_Backend;
const DEFAULT_TIMEOUT = 15_000; // Extended from 10s to 15s
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const TMBD_KEY = Constants.expoConfig?.extra?.TMBD_KEY;
const TMBD_URL = Constants.expoConfig?.extra?.TMBD_URL;

interface ExtendedAxiosRequestConfig extends AxiosRequestConfig {
  _retry?: number;
  skipRetry?: boolean;
}

//functions
function buildImageUrl(path: string, size: string = "w500"): string {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : "";
}

// Enhanced axios instance with retry logic
const api = axios.create({
  baseURL: BASE_URL,
  timeout: DEFAULT_TIMEOUT,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json"
  }
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
        (error.response.status >= 500 || error.response.status === 429 || error.response.status === 408)));

  if (shouldRetry) {
    config._retry += 1;

    // Exponential backoff with jitter
    const delay = RETRY_DELAY * Math.pow(1.5, config._retry - 1) * (0.75 + Math.random() * 0.5);
    console.log(`[API] Retry ${config._retry}/${MAX_RETRIES} for ${config.url} after ${delay.toFixed(0)}ms`);

    // Wait before retrying
    await new Promise(resolve => setTimeout(resolve, delay));

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
  subtitles?: {
    file: string;
    label: string;
    kind: string;
    default?: boolean;
  }[];
  selectedServer?: { id: string; name: string };
  name?: string;
  tmbdID?: string;
  availableQualities?: StreamingLink[];
}

export interface StreamingLink {
  quality: string;
  url: string;
  server: string;
}

export interface Season {
  id: string;
  number: number;
  name: string;
  episode_count: number;
  poster: string;
  year: string;
  season_number: number;
}

export interface SeasonItem {
  id: string;
  number: number;
  name: string;
  episode_count: number;
  poster: string;
  year: string;
  season_number: number;
}

export interface Episode {
  id: string;
  number: number;
  name: string;
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
    name: string;
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
    const serverMessage = error.response?.data?.message || error.response?.data?.error;

    if (status === 404) {
      throw new Error(`Content not found: ${serverMessage || "Resource not available"}`);
    } else if (status === 429) {
      throw new Error("Too many requests. Please try again later.");
    } else if (status === 500) {
      throw new Error(`Server error (${status}): Please try again later.`);
    } else if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      throw new Error("Connection timed out. Please check your internet connection.");
    }

    throw new Error(`${customMessage}: ${serverMessage || error.message || "Unknown API error"}`);
  }

  throw new Error(`${customMessage}: ${error instanceof Error ? error.message : "Unknown error"}`);
}

// 1) Search content
export async function searchContent(
  query: string,
  contentType: "movie" | "tvSeries",
  useFallback: boolean = false
): Promise<SearchItem[]> {
  if (useFallback) {
    // Determine the endpoint based on the content type.
    const endpoint = contentType === "movie" ? "search/movie" : "search/tv";
    try {
      const response = await axios.get(`${TMBD_URL}/${endpoint}`, {
        params: {
          api_key: TMBD_KEY,
          query,
          language: "en-US"
        }
      });
      if (contentType === "movie") {
        return response.data.results.map((movie: any) => ({
          id: movie.id.toString(),
          title: movie.title,
          poster: buildImageUrl(movie.poster_path, "w500"),
          stats: {
            year: movie.release_date ? movie.release_date.split("-")[0] : "",
            rating: movie.vote_average.toString()
          },
          type: "movie",
          slug: slugify(movie.title)
        }));
      } else {
        // For TV series:
        return response.data.results.map((tv: any) => ({
          id: tv.id.toString(),
          title: tv.name,
          poster: buildImageUrl(tv.poster_path, "w500"),
          stats: {
            year: tv.first_air_date ? tv.first_air_date.split("-")[0] : "",
            rating: tv.vote_average.toString()
          },
          type: "tvSeries",
          slug: slugify(tv.name)
        }));
      }
    } catch (error: any) {
      console.error("TMDB search error:", error.message);
      throw new Error("TMDB search failed");
    }
  } else {
    // Use your primary API endpoint.
    try {
      const res = await axios.get(`${Constants.expoConfig?.extra?.API_Backend}/content`, {
        params: { q: query, type: contentType }
      });
      if (res.data && res.data.items) {
        return res.data.items.map((item: any) => ({
          id: item.id.toString(),
          title: item.title,
          poster: item.poster || "",
          stats: item.stats || {},
          type: item.type,
          slug: item.slug || slugify(item.title)
        }));
      }
      return [];
    } catch (error: any) {
      console.error("Primary search error:", error.message);
      throw new Error("Primary search failed");
    }
  }
}
// 2) Movie streaming flow
export async function getMovieStreamingUrl(
  movieId: string,
  incomingSlug?: string,
  useFallback: boolean = false
): Promise<StreamingInfo> {
  if (useFallback) {
    try {
      const fallbackUrl = `https://extractor.0xzile.sbs/${movieId}`;
      const resp = await axios.get(fallbackUrl, { timeout: 15000 });
      if (resp.data && resp.data.success && Array.isArray(resp.data.data)) {
        const sources: any[] = resp.data.data;
        const m3u8Links: StreamingLink[] = sources
          .filter(source => source.stream && source.stream.includes(".m3u8"))
          .map(source => ({
            quality: source.quality || "auto",
            url: source.stream,
            server: source.server || "Unknown Server"
          }));

        if (m3u8Links.length === 0) {
          // Optional: Check for non-m3u8 links if no m3u8 found
          const otherLinks: StreamingLink[] = sources.map(source => ({
            quality: source.quality || "auto",
            url: source.stream,
            server: source.server || "Unknown Server"
          }));
          if (otherLinks.length > 0) {
            console.warn("No .m3u8 links found, using first available link from extractor.");
            const firstLink = otherLinks[0];
            return {
              streamUrl: firstLink.url,
              subtitles: [],
              selectedServer: { id: movieId, name: firstLink.server },
              name: sources[0]?.name || `S${movieId}`,
              availableQualities: otherLinks
            };
          }
          throw new Error("No playable .m3u8 (or any other) stream links found from extractor.");
        }
        let defaultStream =
          m3u8Links.find(link => link.quality === "1080p") ||
          m3u8Links.find(link => link.quality === "720p") ||
          m3u8Links.find(link => link.quality.toLowerCase() === "auto") ||
          m3u8Links[0];
        return {
          streamUrl: defaultStream.url,
          subtitles: [],
          selectedServer: { id: movieId, name: defaultStream.server },
          name: sources[0]?.name || `S${movieId}`,
          availableQualities: m3u8Links
        };
      } else {
        throw new Error(`Fallback extractor returned no data or unsuccessful response for ${fallbackUrl}`);
      }
    } catch (error: any) {
      console.log("Fallback is not available", error);
      throw new Error("Fallback Error");
    }
  }
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
    console.log(`[API] Fetching servers for movie: ${watchSlug}-${movieId}, episodeId: ${episodeId}`);
    const srv = await api.get<{ servers: ServerResponse[]; success?: boolean }>(
      `/movie/${watchSlug}-${movieId}/servers`,
      { params: { episodeId } }
    );

    if (!srv.data.success || !srv.data.servers?.length) {
      throw new Error("No streaming servers available for this movie");
    }

    const servers = srv.data.servers;
    const selectedServer =
      servers.find(s => s.isVidstream === false) ||
      servers.find(s => s.name.toLowerCase().includes("vidcloud")) ||
      servers[1];

    // 5) Fetch sources
    console.log(`[API] Fetching sources for movie: ${watchSlug}-${movieId}, server: ${selectedServer.name}`);
    const src = await api.get<SourcesResponse>(`/movie/${watchSlug}-${movieId}/sources`, {
      params: { episodeId, serverId: selectedServer.id }
    });

    if (!src.data.success || !src.data.sources?.length) {
      throw new Error("No playable sources found for this movie");
    }
    // 6) Build streaming info response
    return {
      streamUrl: src.data.sources[0].file,
      subtitles:
        src.data.tracks?.map(track => ({
          file: track.file,
          label: track.label || "Unknown",
          kind: track.kind || "subtitles",
          default: track.default
        })) || [],
      selectedServer
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
    const urlPath = slug ? `/movie/${formatWatchSlug(slug)}-${seriesId}/servers` : `/movie/${seriesId}/servers`;

    const res = await api.get<{ servers: ServerResponse[]; success?: boolean }>(urlPath, {
      params: { episodeId }
    });

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
export async function getSeasons(seriesId: string, incomingSlug?: string): Promise<SeasonItem[]> {
  try {
    if (!seriesId) {
      console.error("Series ID is required");
      return [];
    }

    // Validate and format the slug
    let baseSlug = incomingSlug || "";
    if (!baseSlug) {
      throw new Error("Slug is required for season requests - provide slug or series title");
    }

    // Clean existing watch- prefix if present
    baseSlug = baseSlug.replace(/^watch-/i, "");
    const watchSlug = formatWatchSlug(baseSlug);

    console.log(`[DEBUG] Fetching seasons at: ${watchSlug}-${seriesId}`);

    const res = await api.get<SeasonResponse>(`/movie/${watchSlug}-${seriesId}/seasons`);

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
export async function getEpisodesForSeason(seriesId: string, seasonId: string, slug?: string): Promise<Episode[]> {
  try {
    if (!seasonId) {
      console.warn("Season ID is required");
      return [];
    }

    const res = await api.get<EpisodeResponse>(`/movie/${slug}-${seriesId}/episodes`, {
      params: { seasonId }
    });

    if (!res.data.success || !res.data.episodes?.length) {
      console.warn(`No episodes found for season ${seasonId}`);
      return [];
    }

    return res.data.episodes.map(ep => ({
      id: ep.id,
      name: ep.name,
      number: ep.number,
      title: ep.title || `Episode ${ep.number}`,
      description: ep.description,
      img: ep.img
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
  serverId?: string,
  incomingSlug?: string,
  useFallback: boolean = false,
  seasonNumber?: string,
  episodeNumber?: string
): Promise<StreamingInfo> {
  // If using fallback, call the fallback function
  if (useFallback) {
    if (!seasonNumber || !episodeNumber) {
      throw new Error("Season and episode numbers are required for fallback streaming");
    }
    return getEpisodeStreamingUrlFallback(seriesId, seasonNumber, episodeNumber);
  }
  try {
    if (!incomingSlug) {
      throw new Error("Slug is required for season requests - provide slug or series title");
    }

    // Clean existing watch- prefix if present
    const baseSlug = incomingSlug.replace(/^watch-/i, "");
    const watchSlug = formatWatchSlug(baseSlug);

    // Get series details for slug
    console.log(`[API] Fetching series details for ID: ${seriesId}`);
    const seriesDetail = await api.get<MovieDetailResponse>(`/movie/${incomingSlug}-${seriesId}`);

    if (!seriesDetail.data) {
      throw new Error(`Series with ID ${seriesId} not found`);
    }

    // Fetch servers
    console.log(`[API] Fetching servers for episode ID: ${episodeId}`);
    const { servers } = await getEpisodeSources(seriesId, episodeId, baseSlug);

    if (!servers.length) {
      throw new Error("No streaming servers available for this episode");
    }

    // Select server based on preference
    const selectedServer = serverId
      ? servers.find(s => s.id === serverId)
      : servers.find(s => s.isVidstream === true) ||
        servers.find(s => s.name.toLowerCase().includes("vidcloud")) ||
        servers[0];

    if (!selectedServer?.id) {
      throw new Error("Invalid server selection");
    }

    // Get sources
    console.log(`[API] Fetching sources for episode: ${episodeId}, server: ${selectedServer.name}`);
    const src = await api.get<SourcesResponse>(`/movie/${watchSlug}-${seriesId}/sources`, {
      params: {
        serverId: selectedServer.id,
        episodeId
      }
    });

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
        src.data.tracks?.map(track => ({
          file: track.file,
          label: track.label || "Unknown",
          kind: track.kind || "subtitles",
          default: track.default
        })) || [],
      selectedServer
    };
  } catch (error) {
    return handleApiError(error, "Episode stream setup failed");
  }
}
export async function getEpisodeTMBD(seriesId: string, seasonNumber: string): Promise<Episode[]> {
  try {
    const response = await axios.get(`${TMBD_URL}/tv/${seriesId}/season/${seasonNumber}`, {
      params: {
        api_key: TMBD_KEY,
        language: "en-US"
      }
    });
    if (response.data && response.data.episodes) {
      return response.data.episodes.map((ep: any) => ({
        id: ep.id.toString(),
        number: ep.episode_number,
        title: ep.name,
        description: ep.overview,
        img: ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : ""
      }));
    }
    return [];
  } catch (error: any) {
    console.error("Error in getEpisodesForSeasonFallback:", error.message);
    throw new Error("Failed to fetch episodes via fallback");
  }
}

export async function getEpisodeStreamingUrlFallback(
  seriesId: string,
  seasonNumber: string,
  episodeNumber: string
): Promise<StreamingInfo> {
  try {
    const fallbackUrl = `https://extractor.0xzile.sbs/${seriesId}/${seasonNumber}/${episodeNumber}`;
    console.log(`[FALLBACK] Fetching episode stream from: ${fallbackUrl}`);

    const resp = await axios.get(fallbackUrl, { timeout: 15000 });

    if (resp.data && resp.data.success && Array.isArray(resp.data.data)) {
      const sources: any[] = resp.data.data;
      const m3u8Links: StreamingLink[] = sources
        .filter(source => source.stream && source.stream.includes(".m3u8"))
        .map(source => ({
          quality: source.quality || "auto",
          url: source.stream,
          server: source.server || "Unknown Server"
        }));

      if (m3u8Links.length === 0) {
        // Optional: Check for non-m3u8 links if no m3u8 found
        const otherLinks: StreamingLink[] = sources.map(source => ({
          quality: source.quality || "auto",
          url: source.stream,
          server: source.server || "Unknown Server"
        }));
        if (otherLinks.length > 0) {
          console.warn("No .m3u8 links found, using first available link from extractor.");
          const firstLink = otherLinks[0];
          return {
            streamUrl: firstLink.url,
            subtitles: [],
            selectedServer: { id: seriesId, name: firstLink.server },
            name: sources[0]?.name || `S${seasonNumber}E${episodeNumber}`,
            availableQualities: otherLinks
          };
        }
        throw new Error("No playable .m3u8 (or any other) stream links found from extractor.");
      }

      let defaultStream =
        m3u8Links.find(link => link.quality === "1080p") ||
        m3u8Links.find(link => link.quality === "720p") ||
        m3u8Links.find(link => link.quality.toLowerCase() === "auto") ||
        m3u8Links[0];

      return {
        streamUrl: defaultStream.url,
        subtitles: [],
        selectedServer: { id: seriesId, name: defaultStream.server },
        name: sources[0]?.name || `S${seasonNumber}E${episodeNumber}`,
        availableQualities: m3u8Links
      };
    } else {
      throw new Error(`Fallback extractor returned no data or unsuccessful response for ${fallbackUrl}`);
    }
  } catch (error: any) {
    console.error("Episode fallback error:", error);
    throw new Error(`Fallback streaming failed: ${error.message}`);
  }
}

export default {
  searchContent,
  getMovieStreamingUrl,
  getEpisodeSources,
  getSeasons,
  getEpisodesForSeason,
  getEpisodeStreamingUrl,
  getEpisodeTMBD,
  getEpisodeStreamingUrlFallback,
  slugify
};
