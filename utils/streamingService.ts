import axios, { AxiosError, AxiosRequestConfig } from "axios";
import Constants from "expo-constants";

// Configuration
const BASE_URL = Constants.expoConfig?.extra?.API_Backend;
const DEFAULT_TIMEOUT = 15_000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const TMBD_KEY = Constants.expoConfig?.extra?.TMBD_KEY;
const TMBD_URL = Constants.expoConfig?.extra?.TMBD_URL;
export const EXTRA_URL =
  Constants.expoConfig?.extra?.extractorUrl || (Constants.manifest as any)?.extra?.extractorUrl || "";

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

  if (!config || config?.skipRetry) {
    return Promise.reject(error);
  }

  if (config._retry === undefined) {
    config._retry = 0;
  }

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
    const delay = RETRY_DELAY * Math.pow(1.5, config._retry - 1) * (0.75 + Math.random() * 0.5);

    console.log(`[API] Retry ${config._retry}/${MAX_RETRIES} for ${config.url} after ${delay.toFixed(0)}ms`);

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

export interface FlixerSource {
  quality: string;
  title: string;
  url: string;
  type: string;
  referer: string;
  requiresSegmentProxy: boolean;
  status: string;
  language: string;
  server: string;
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
  headers?: {
    Referer?: string;
    "User-Agent"?: string;
  };
  availableQualities?: StreamingLink[];
  // NEW: Flixer sources for multi-source switching
  flixerSources?: FlixerSource[];
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
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatWatchSlug(slug: string): string {
  return slug.startsWith("watch-") ? slug : `watch-${slug}`;
}

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

// 2) Movie streaming flow with Flixer multi-source support
export async function getMovieStreamingUrl(
  movieId: string,
  incomingSlug?: string,
  useFallback: boolean = false,
  vidfastOnly: boolean = false,
  useWootly: boolean = false
): Promise<StreamingInfo> {
  console.log("[STREAMING] Starting with:", {
    movieId,
    useFallback,
    vidfastOnly,
    useWootly
  });

  // VIDFAST SOURCE
  if (vidfastOnly) {
    console.log("[VIDFAST] Fetching stream...");
    const vidfastUrl = `${EXTRA_URL}/vidfast/${movieId}`;
    try {
      const resp = await axios.get<{ success: boolean; data: any }>(vidfastUrl, {
        timeout: 20000
      });

      console.log("[VIDFAST] Response:", JSON.stringify(resp.data, null, 2));

      if (!resp.data.success || !resp.data.data) {
        throw new Error("Vidfast failed - no data returned");
      }

      const streamData = resp.data.data;

      if (!streamData.streamUrl) {
        throw new Error("No stream URL found in Vidfast response");
      }

      return {
        streamUrl: streamData.streamUrl,
        selectedServer: {
          id: movieId,
          name: `Vidfast (${streamData.method || "direct"})`
        },
        availableQualities:
          streamData.foundStreams?.map((url: string, index: number) => ({
            quality: index === 0 ? "1080P" : index === 1 ? "720P" : `Stream ${index + 1}`,
            url: url,
            server: "Vidfast"
          })) || [],
        headers: streamData.headers,
        subtitles: []
      };
    } catch (error: any) {
      console.error("[VIDFAST] Error:", error.message);
      throw error;
    }
  }

  // WOOTLY SOURCE
  if (useWootly) {
    console.log("[WOOTLY] Fetching stream...");
    return getWootlyStreamingUrl(movieId, false, false, true);
  }

  // TMDB FALLBACK SOURCE with Flixer multi-source
  if (useFallback) {
    console.log("[FALLBACK] Fetching TMDB stream with Flixer sources...");
    try {
      const fallbackUrl = `${EXTRA_URL}/flixer/${movieId}`;
      console.log("[FALLBACK] URL:", fallbackUrl);

      const resp = await axios.get(fallbackUrl, { timeout: 20000 });
      console.log("[FALLBACK] Response:", JSON.stringify(resp.data, null, 2));

      const responseData = resp.data?.data || resp.data;

      // Check if response has sources array (Flixer format)
      if (resp.data?.success && Array.isArray(responseData.sources)) {
        const sources: FlixerSource[] = responseData.sources;
        const subtitles = responseData.subtitles || [];

        console.log("[FALLBACK] Found Flixer sources:", sources.length);

        // Filter for working HLS streams
        const m3u8Links = sources
          .filter(source => source.status === "working" && source.url.includes(".m3u8"))
          .map(source => ({
            quality: source.quality || "auto",
            url: source.url,
            server: source.server || source.title
          }));

        if (m3u8Links.length === 0) {
          throw new Error("No playable stream links found from Flixer");
        }

        // Select default stream (prefer auto quality)
        const defaultStream = m3u8Links.find(link => link.quality.toLowerCase() === "auto") || m3u8Links[0];

        return {
          streamUrl: defaultStream.url,
          subtitles: subtitles.map((sub: any) => ({
            file: sub.url,
            label: sub.label || "Unknown",
            kind: "subtitles",
            default: false
          })),
          selectedServer: { id: movieId, name: defaultStream.server },
          name: `Movie ${movieId}`,
          availableQualities: m3u8Links,
          // Include all Flixer sources for switching
          flixerSources: sources.filter(s => s.status === "working")
        };
      }

      // Handle autoembed format (legacy)
      if (responseData?.streamUrl) {
        console.log("[FALLBACK] Found autoembed format response");
        return {
          streamUrl: responseData.streamUrl,
          subtitles: [],
          selectedServer: {
            id: movieId,
            name: responseData.method || responseData.source || "TMDB"
          },
          availableQualities:
            responseData.foundStreams?.map((url: string, index: number) => ({
              quality: index === 0 ? "1080P" : index === 1 ? "720P" : `Quality ${index + 1}`,
              url: url,
              server: responseData.source || "TMDB"
            })) || [],
          headers: responseData.headers
        };
      }

      throw new Error("Fallback extractor returned no data");
    } catch (error: any) {
      console.error("[FALLBACK] Error:", error.message);
      throw new Error(`Fallback failed: ${error.message}`);
    }
  }

  // PRIMARY TMDB SOURCE
  console.log("[PRIMARY] Fetching TMDB movie details...");
  try {
    const detail = await api.get<any>(`/movie/${incomingSlug ? `${incomingSlug}-${movieId}` : movieId}`);

    console.log("[PRIMARY] Response structure:", JSON.stringify(detail.data, null, 2));

    if (detail.data?.data?.streamUrl) {
      const streamData = detail.data.data;
      return {
        streamUrl: streamData.streamUrl,
        subtitles:
          streamData.tracks?.map((track: any) => ({
            file: track.file,
            label: track.label || "Unknown",
            kind: track.kind || "subtitles",
            default: track.default
          })) || [],
        selectedServer: {
          id: movieId,
          name: streamData.method || streamData.source || "AutoEmbed"
        },
        availableQualities:
          streamData.foundStreams?.map((url: string, index: number) => ({
            quality: index === 0 ? "1080P" : index === 1 ? "720P" : `Quality ${index + 1}`,
            url: url,
            server: streamData.source || "AutoEmbed"
          })) || [],
        headers: streamData.headers
      };
    }

    const { title, slug: returnedSlug, episodeId } = detail.data;

    if (!episodeId) {
      throw new Error(`No episode ID found for movie ${movieId} (${title})`);
    }

    const baseSlug = incomingSlug || returnedSlug || slugify(title);
    const watchSlug = formatWatchSlug(baseSlug);

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
      servers[0];

    const src = await api.get<SourcesResponse>(`/movie/${watchSlug}-${movieId}/sources`, {
      params: { episodeId, serverId: selectedServer.id }
    });

    if (!src.data.success || !src.data.sources?.length) {
      throw new Error("No playable sources found for this movie");
    }

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
  } catch (error: any) {
    console.error("[PRIMARY] Error:", error.message);
    return handleApiError(error, "Stream setup failed");
  }
}

// Fetch Flixer sources specifically for source switching
export async function getFlixerSources(
  movieId: string,
  seasonNumber?: string,
  episodeNumber?: string
): Promise<FlixerSource[]> {
  try {
    let url = `${EXTRA_URL}/flixer/${movieId}`;
    if (seasonNumber && episodeNumber) {
      url += `/${seasonNumber}/${episodeNumber}`;
    }

    console.log("[FLIXER] Fetching sources from:", url);
    const resp = await axios.get(url, { timeout: 20000 });

    if (resp.data?.success && resp.data?.data?.sources) {
      return resp.data.data.sources.filter((s: FlixerSource) => s.status === "working");
    }

    return [];
  } catch (error: any) {
    console.error("[FLIXER] Error fetching sources:", error.message);
    return [];
  }
}

// 2a) Fetch server list for an episode
export async function getEpisodeSources(
  seriesId: string,
  episodeId: string,
  slug?: string
): Promise<{ servers: ServerResponse[] }> {
  try {
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

    let baseSlug = incomingSlug || "";
    if (!baseSlug) {
      throw new Error("Slug is required for season requests - provide slug or series title");
    }

    baseSlug = baseSlug.replace(/^watch-/i, "");
    const watchSlug = formatWatchSlug(baseSlug);

    const res = await api.get<SeasonResponse>(`/movie/${watchSlug}-${seriesId}/seasons`);

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

//wootly source
async function getWootlyStreamingUrl(
  id: string,
  vidfastOnly: boolean = false,
  useFallback: boolean = false,
  useWootly: boolean = false,
  seasonNumber?: string,
  episodeNumber?: string
): Promise<StreamingInfo> {
  if (!useWootly) throw new Error("Wootly not enabled");

  try {
    let url = `${EXTRA_URL}/wootly/${id}`;
    if (seasonNumber && episodeNumber) {
      url += `/${seasonNumber}/${episodeNumber}`;
    }

    console.log("[WOOTLY] Fetching from:", url);
    const resp = await axios.get(url, { timeout: 20000 });

    if (resp.data && resp.data.success && Array.isArray(resp.data.data) && resp.data.data.length > 0) {
      const sources = resp.data.data;

      const determineQuality = (source: any): string => {
        const url = source.url || source.stream || "";
        if (url.includes(".mp4")) return "AUTO";
        if (url.includes(".m3u8")) return "AUTO";
        if (source.quality && /^\d{3,4}[pP]$/.test(source.quality)) {
          return source.quality.toUpperCase();
        }
        const match = url.match(/(\d{3,4})[pP]/);
        if (match) return `${match[1]}P`;
        return "AUTO";
      };

      const isPlayableUrl = (url: string): boolean => {
        if (!url || typeof url !== "string") return false;
        if (/\.(mp4|webm|mkv|avi|mov|m3u8)(\?|$)/i.test(url)) return true;
        if (url.includes("nebula.to")) return true;
        return false;
      };

      const allLinks: StreamingLink[] = sources
        .filter((source: any) => {
          const url = source.url || source.stream;
          return url && isPlayableUrl(url);
        })
        .map((source: any) => ({
          quality: determineQuality(source),
          url: source.url || source.stream,
          server: source.source || source.server || "Wootly"
        }));

      if (allLinks.length === 0) {
        throw new Error("No playable streams found from Wootly");
      }

      const nebulaLinks = allLinks.filter(link => link.url.includes("nebula.to"));
      const otherLinks = allLinks.filter(link => !link.url.includes("nebula.to"));

      const mp4Links = nebulaLinks.filter(link => link.url.includes(".mp4"));
      const webmLinks = nebulaLinks.filter(link => link.url.includes(".webm"));

      const linksToUse = [...mp4Links, ...webmLinks, ...otherLinks];

      if (linksToUse.length === 0) {
        throw new Error("No valid streams after filtering");
      }

      let defaultStream =
        linksToUse.find(l => l.url.includes(".mp4")) || linksToUse.find(l => l.url.includes(".m3u8")) || linksToUse[0];

      const firstSourceWithUrl = sources.find(
        (s: any) => s.url === defaultStream.url || s.stream === defaultStream.url
      );
      const streamHeaders = firstSourceWithUrl?.headers;

      return {
        streamUrl: defaultStream.url,
        selectedServer: { id, name: defaultStream.server },
        availableQualities: linksToUse,
        subtitles: [],
        headers: streamHeaders
          ? {
              Referer: streamHeaders.Referer || "https://web.wootly.ch",
              "User-Agent":
                streamHeaders["User-Agent"] || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
          : undefined
      };
    } else {
      throw new Error("Wootly returned no data or unsuccessful response");
    }
  } catch (error: any) {
    console.error("[WOOTLY] Error:", error.message);
    throw new Error(`Wootly failed: ${error.message}`);
  }
}

// 5) Episode → streaming flow
export async function getEpisodeStreamingUrl(
  seriesId: string,
  episodeId: string,
  serverId?: string,
  incomingSlug?: string,
  vidfastOnly: boolean = false,
  useFallback: boolean = false,
  seasonNumber?: string,
  episodeNumber?: string,
  useWootly: boolean = false
): Promise<StreamingInfo> {
  if (vidfastOnly) {
    if (!seasonNumber || !episodeNumber) {
      throw new Error("Season and episode numbers are required for Vidfast streaming");
    }

    const vidfastUrl = `${EXTRA_URL}/vidfast/${seriesId}/${seasonNumber}/${episodeNumber}`;
    const resp = await axios.get<{ success: boolean; data: any }>(vidfastUrl, {
      timeout: 15000
    });

    if (!resp.data.success || !resp.data.data) {
      throw new Error("Vidfast failed");
    }

    const { streamUrl } = resp.data.data;

    if (!streamUrl) {
      throw new Error("No stream URL found in Vidfast response");
    }

    return {
      streamUrl,
      selectedServer: { id: seriesId, name: "Vidfast" },
      availableQualities: []
    };
  }

  if (useFallback) {
    if (!seasonNumber || !episodeNumber) {
      throw new Error("Season and episode numbers are required for fallback streaming");
    }
    return getEpisodeStreamingUrlFallback(seriesId, seasonNumber, episodeNumber);
  }

  if (useWootly) {
    if (!seasonNumber || !episodeNumber) {
      throw new Error("Season and Episode no are required");
    }
    return getWootlyStreamingUrl(seriesId, vidfastOnly, useFallback, useWootly, seasonNumber, episodeNumber);
  }

  try {
    if (!incomingSlug) {
      throw new Error("Slug is required for season requests - provide slug or series title");
    }

    const baseSlug = incomingSlug.replace(/^watch-/i, "");
    const watchSlug = formatWatchSlug(baseSlug);

    const seriesDetail = await api.get<MovieDetailResponse>(`/movie/${incomingSlug}-${seriesId}`);

    if (!seriesDetail.data) {
      throw new Error(`Series with ID ${seriesId} not found`);
    }

    const { servers } = await getEpisodeSources(seriesId, episodeId, baseSlug);

    if (!servers.length) {
      throw new Error("No streaming servers available for this episode");
    }

    const selectedServer = serverId
      ? servers.find(s => s.id === serverId)
      : servers.find(s => s.isVidstream === true) ||
        servers.find(s => s.name.toLowerCase().includes("vidcloud")) ||
        servers[0];

    if (!selectedServer?.id) {
      throw new Error("Invalid server selection");
    }

    const src = await api.get<SourcesResponse>(`/movie/${watchSlug}-${seriesId}/sources`, {
      params: {
        serverId: selectedServer.id,
        episodeId
      }
    });

    if (!src.data.success || !src.data.sources?.length) {
      throw new Error("No playable sources found for this episode");
    }

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
    const fallbackUrl = `${EXTRA_URL}/flixer/${seriesId}/${seasonNumber}/${episodeNumber}`;
    console.log(`[FALLBACK] Fetching episode stream from: ${fallbackUrl}`);

    const resp = await axios.get(fallbackUrl, { timeout: 15000 });

    if (!resp.data?.success || !resp.data?.data) {
      throw new Error(`Extractor returned unsuccessful response`);
    }

    const data = resp.data.data;

    // Handle Flixer format with sources array
    if (data.sources && Array.isArray(data.sources)) {
      const sources: FlixerSource[] = data.sources;
      const subtitles = data.subtitles || [];

      const m3u8Links = sources
        .filter(s => s.status === "working" && s.url.includes(".m3u8"))
        .map(s => ({
          quality: s.quality || "auto",
          url: s.url,
          server: s.server || s.title
        }));

      if (!m3u8Links.length) {
        throw new Error("No playable stream links found");
      }

      const defaultStream = m3u8Links.find(l => l.quality.toLowerCase() === "auto") || m3u8Links[0];

      return {
        streamUrl: defaultStream.url,
        subtitles: subtitles.map((sub: any) => ({
          file: sub.url,
          label: sub.label || "Unknown",
          kind: "subtitles",
          default: false
        })),
        selectedServer: { id: seriesId, name: defaultStream.server },
        name: `S${seasonNumber}E${episodeNumber}`,
        availableQualities: m3u8Links,
        flixerSources: sources.filter(s => s.status === "working")
      };
    }

    // Legacy format
    if (data.streamUrl) {
      return {
        streamUrl: data.streamUrl,
        subtitles: data.tracks || [],
        selectedServer: {
          id: seriesId,
          name: data.source || "Extractor"
        },
        name: `S${seasonNumber}E${episodeNumber}`,
        availableQualities: [
          {
            quality: "auto",
            url: data.streamUrl,
            server: data.source || "Extractor"
          }
        ]
      };
    }

    throw new Error("Unknown extractor response format");
  } catch (error: any) {
    console.error("Episode fallback error:", error);
    throw new Error(`Fallback streaming failed: ${error.message}`);
  }
}

export default {
  searchContent,
  getMovieStreamingUrl,
  getFlixerSources,
  getEpisodeSources,
  getSeasons,
  getEpisodesForSeason,
  getEpisodeStreamingUrl,
  getEpisodeTMBD,
  getEpisodeStreamingUrlFallback,
  slugify
};
