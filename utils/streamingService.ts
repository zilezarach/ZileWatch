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
  Constants.expoConfig?.extra?.extractorUrl ||
  (Constants.manifest as any)?.extra?.extractorUrl ||
  "https://extractor.0xzile.sbs";

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
      } after ${delay.toFixed(0)}ms`,
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
    const serverMessage =
      error.response?.data?.message || error.response?.data?.error;

    if (status === 404) {
      throw new Error(
        `Content not found: ${serverMessage || "Resource not available"}`,
      );
    } else if (status === 429) {
      throw new Error("Too many requests. Please try again later.");
    } else if (status === 500) {
      throw new Error(`Server error (${status}): Please try again later.`);
    } else if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      throw new Error(
        "Connection timed out. Please check your internet connection.",
      );
    }

    throw new Error(
      `${customMessage}: ${
        serverMessage || error.message || "Unknown API error"
      }`,
    );
  }

  throw new Error(
    `${customMessage}: ${
      error instanceof Error ? error.message : "Unknown error"
    }`,
  );
}

// 1) Search content
export async function searchContent(
  query: string,
  contentType: "movie" | "tvSeries",
  useFallback: boolean = false,
): Promise<SearchItem[]> {
  if (useFallback) {
    // Determine the endpoint based on the content type.
    const endpoint = contentType === "movie" ? "search/movie" : "search/tv";
    try {
      const response = await axios.get(`${TMBD_URL}/${endpoint}`, {
        params: {
          api_key: TMBD_KEY,
          query,
          language: "en-US",
        },
      });
      if (contentType === "movie") {
        return response.data.results.map((movie: any) => ({
          id: movie.id.toString(),
          title: movie.title,
          poster: buildImageUrl(movie.poster_path, "w500"),
          stats: {
            year: movie.release_date ? movie.release_date.split("-")[0] : "",
            rating: movie.vote_average.toString(),
          },
          type: "movie",
          slug: slugify(movie.title),
        }));
      } else {
        // For TV series:
        return response.data.results.map((tv: any) => ({
          id: tv.id.toString(),
          title: tv.name,
          poster: buildImageUrl(tv.poster_path, "w500"),
          stats: {
            year: tv.first_air_date ? tv.first_air_date.split("-")[0] : "",
            rating: tv.vote_average.toString(),
          },
          type: "tvSeries",
          slug: slugify(tv.name),
        }));
      }
    } catch (error: any) {
      console.error("TMDB search error:", error.message);
      throw new Error("TMDB search failed");
    }
  } else {
    // Use your primary API endpoint.
    try {
      const res = await axios.get(
        `${Constants.expoConfig?.extra?.API_Backend}/content`,
        {
          params: { q: query, type: contentType },
        },
      );
      if (res.data && res.data.items) {
        return res.data.items.map((item: any) => ({
          id: item.id.toString(),
          title: item.title,
          poster: item.poster || "",
          stats: item.stats || {},
          type: item.type,
          slug: item.slug || slugify(item.title),
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
  useFallback: boolean = false,
  vidfastOnly: boolean = false,
  useWootly: boolean = false,
): Promise<StreamingInfo> {
  console.log("[STREAMING] Starting with:", {
    movieId,
    useFallback,
    vidfastOnly,
    useWootly,
  });

  // ========================================
  // 1. VIDFAST SOURCE
  // ========================================
  if (vidfastOnly) {
    console.log("[VIDFAST] Fetching stream...");
    const vidfastUrl = `${EXTRA_URL}/vidfast/${movieId}`;

    try {
      const resp = await axios.get<{ success: boolean; data: any }>(
        vidfastUrl,
        {
          timeout: 20000,
        },
      );

      console.log("[VIDFAST] Response:", JSON.stringify(resp.data, null, 2));

      if (!resp.data.success || !resp.data.data) {
        throw new Error("Vidfast failed - no data returned");
      }

      const streamData = resp.data.data;

      if (!streamData.streamUrl) {
        throw new Error("No stream URL found in Vidfast response");
      }

      console.log("[VIDFAST] Stream validated:", streamData.isValidated);
      console.log("[VIDFAST] Method:", streamData.method);
      console.log(
        "[VIDFAST] Found streams:",
        streamData.foundStreams?.length || 0,
      );

      return {
        streamUrl: streamData.streamUrl,
        selectedServer: {
          id: movieId,
          name: `Vidfast (${streamData.method || "direct"})`,
        },
        availableQualities:
          streamData.foundStreams?.map((url: string, index: number) => ({
            quality:
              index === 0
                ? "1080P"
                : index === 1
                  ? "720P"
                  : `Stream ${index + 1}`,
            url: url,
            server: "Vidfast",
          })) || [],
        headers: streamData.headers,
        subtitles: [],
      };
    } catch (error: any) {
      console.error("[VIDFAST] Error:", error.message);
      if (error.response) {
        console.error("[VIDFAST] Response status:", error.response.status);
        console.error("[VIDFAST] Response data:", error.response.data);
      }
      throw error;
    }
  }

  // ========================================
  // 2. WOOTLY SOURCE
  // ========================================
  if (useWootly) {
    console.log("[WOOTLY] Fetching stream...");
    return getWootlyStreamingUrl(movieId, false, false, true);
  }

  // ========================================
  // 3. TMDB FALLBACK SOURCE
  // ========================================
  if (useFallback) {
    console.log("[FALLBACK] Fetching TMDB stream...");

    try {
      const fallbackUrl = `${EXTRA_URL}/tmdb/${movieId}`;
      console.log("[FALLBACK] URL:", fallbackUrl);

      const resp = await axios.get(fallbackUrl, { timeout: 20000 });

      console.log("[FALLBACK] Response:", JSON.stringify(resp.data, null, 2));

      // Handle nested response structure
      const responseData = resp.data?.data || resp.data;

      // Check if it's the autoembed response format
      if (responseData?.streamUrl) {
        console.log("[FALLBACK] Found autoembed format response");

        return {
          streamUrl: responseData.streamUrl,
          subtitles: [],
          selectedServer: {
            id: movieId,
            name: responseData.method || responseData.source || "TMDB",
          },
          availableQualities:
            responseData.foundStreams?.map((url: string, index: number) => ({
              quality:
                index === 0
                  ? "1080P"
                  : index === 1
                    ? "720P"
                    : `Quality ${index + 1}`,
              url: url,
              server: responseData.source || "TMDB",
            })) || [],
          headers: responseData.headers,
        };
      }

      // Otherwise handle as array of sources (legacy format)
      if (resp.data?.success && Array.isArray(responseData)) {
        const sources: any[] = responseData;

        const m3u8Links: StreamingLink[] = sources
          .filter((source) => source.stream && source.stream.includes(".m3u8"))
          .map((source) => ({
            quality: source.quality || "auto",
            url: source.stream,
            server: source.server || "Unknown Server",
          }));

        if (m3u8Links.length === 0) {
          const otherLinks: StreamingLink[] = sources
            .filter((source) => source.stream)
            .map((source) => ({
              quality: source.quality || "auto",
              url: source.stream,
              server: source.server || "Unknown Server",
            }));

          if (otherLinks.length > 0) {
            console.warn(
              "[FALLBACK] No .m3u8 links found, using first available link",
            );
            const firstLink = otherLinks[0];

            return {
              streamUrl: firstLink.url,
              subtitles: [],
              selectedServer: { id: movieId, name: firstLink.server },
              name: sources[0]?.name || `Movie ${movieId}`,
              availableQualities: otherLinks,
            };
          }

          throw new Error("No playable stream links found from fallback");
        }

        let defaultStream =
          m3u8Links.find((link) => link.quality === "1080p") ||
          m3u8Links.find((link) => link.quality === "720p") ||
          m3u8Links.find((link) => link.quality.toLowerCase() === "auto") ||
          m3u8Links[0];

        return {
          streamUrl: defaultStream.url,
          subtitles: [],
          selectedServer: { id: movieId, name: defaultStream.server },
          name: sources[0]?.name || `Movie ${movieId}`,
          availableQualities: m3u8Links,
        };
      } else {
        throw new Error("Fallback extractor returned no data");
      }
    } catch (error: any) {
      console.error("[FALLBACK] Error:", error.message);
      throw new Error(`Fallback failed: ${error.message}`);
    }
  }

  // ========================================
  // 4. PRIMARY TMDB SOURCE (DEFAULT)
  // ========================================
  console.log("[PRIMARY] Fetching TMDB movie details...");

  try {
    // Fetch movie details (or directly get streaming info)
    const detail = await api.get<any>(
      `/movie/${incomingSlug ? `${incomingSlug}-${movieId}` : movieId}`,
    );

    console.log(
      "[PRIMARY] Response structure:",
      JSON.stringify(detail.data, null, 2),
    );

    // Check if response contains direct streaming data (from backend's autoembed)
    if (detail.data?.data?.streamUrl) {
      console.log("[PRIMARY] Found direct stream URL in response");
      const streamData = detail.data.data;

      return {
        streamUrl: streamData.streamUrl,
        subtitles:
          streamData.tracks?.map((track: any) => ({
            file: track.file,
            label: track.label || "Unknown",
            kind: track.kind || "subtitles",
            default: track.default,
          })) || [],
        selectedServer: {
          id: movieId,
          name: streamData.method || streamData.source || "AutoEmbed",
        },
        availableQualities:
          streamData.foundStreams?.map((url: string, index: number) => ({
            quality:
              index === 0
                ? "1080P"
                : index === 1
                  ? "720P"
                  : `Quality ${index + 1}`,
            url: url,
            server: streamData.source || "AutoEmbed",
          })) || [],
        headers: streamData.headers,
      };
    }

    // Otherwise, follow the original flow (legacy API format)
    const { title, slug: returnedSlug, episodeId } = detail.data;

    console.log("[PRIMARY] Movie details:", { title, episodeId });

    if (!episodeId) {
      throw new Error(`No episode ID found for movie ${movieId} (${title})`);
    }

    // Build slug for subsequent requests
    const baseSlug = incomingSlug || returnedSlug || slugify(title);
    const watchSlug = formatWatchSlug(baseSlug);

    // Fetch servers
    console.log("[PRIMARY] Fetching servers...");
    const srv = await api.get<{ servers: ServerResponse[]; success?: boolean }>(
      `/movie/${watchSlug}-${movieId}/servers`,
      { params: { episodeId } },
    );

    console.log("[PRIMARY] Servers response:", srv.data);

    if (!srv.data.success || !srv.data.servers?.length) {
      throw new Error("No streaming servers available for this movie");
    }

    const servers = srv.data.servers;
    const selectedServer =
      servers.find((s) => s.isVidstream === false) ||
      servers.find((s) => s.name.toLowerCase().includes("vidcloud")) ||
      servers[0];

    console.log("[PRIMARY] Selected server:", selectedServer);

    // Fetch sources
    console.log("[PRIMARY] Fetching sources...");
    const src = await api.get<SourcesResponse>(
      `/movie/${watchSlug}-${movieId}/sources`,
      {
        params: { episodeId, serverId: selectedServer.id },
      },
    );

    console.log("[PRIMARY] Sources response:", src.data);

    if (!src.data.success || !src.data.sources?.length) {
      throw new Error("No playable sources found for this movie");
    }

    // Build streaming info response
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
  } catch (error: any) {
    console.error("[PRIMARY] Error:", error.message);
    return handleApiError(error, "Stream setup failed");
  }
}

// 2a) Fetch server list for an episode
export async function getEpisodeSources(
  seriesId: string,
  episodeId: string,
  slug?: string,
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
      },
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
  incomingSlug?: string,
): Promise<SeasonItem[]> {
  try {
    if (!seriesId) {
      console.error("Series ID is required");
      return [];
    }

    // Validate and format the slug
    let baseSlug = incomingSlug || "";
    if (!baseSlug) {
      throw new Error(
        "Slug is required for season requests - provide slug or series title",
      );
    }

    // Clean existing watch- prefix if present
    baseSlug = baseSlug.replace(/^watch-/i, "");
    const watchSlug = formatWatchSlug(baseSlug);

    console.log(`[DEBUG] Fetching seasons at: ${watchSlug}-${seriesId}`);

    const res = await api.get<SeasonResponse>(
      `/movie/${watchSlug}-${seriesId}/seasons`,
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
  seasonId: string,
  slug?: string,
): Promise<Episode[]> {
  try {
    if (!seasonId) {
      console.warn("Season ID is required");
      return [];
    }

    const res = await api.get<EpisodeResponse>(
      `/movie/${slug}-${seriesId}/episodes`,
      {
        params: { seasonId },
      },
    );

    if (!res.data.success || !res.data.episodes?.length) {
      console.warn(`No episodes found for season ${seasonId}`);
      return [];
    }

    return res.data.episodes.map((ep) => ({
      id: ep.id,
      name: ep.name,
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

//wootly source
async function getWootlyStreamingUrl(
  id: string,
  vidfastOnly: boolean = false,
  useFallback: boolean = false,
  useWootly: boolean = false,
  seasonNumber?: string,
  episodeNumber?: string,
): Promise<StreamingInfo> {
  if (!useWootly) throw new Error("Wootly not enabled");

  try {
    let url = `${EXTRA_URL}/wootly/${id}`;
    if (seasonNumber && episodeNumber) {
      url += `/${seasonNumber}/${episodeNumber}`;
    }

    console.log("[WOOTLY] Fetching from:", url);
    const resp = await axios.get(url, { timeout: 20000 });

    console.log("[WOOTLY] Response:", JSON.stringify(resp.data, null, 2));

    if (
      resp.data &&
      resp.data.success &&
      Array.isArray(resp.data.data) &&
      resp.data.data.length > 0
    ) {
      const sources = resp.data.data;

      // Helper function to determine quality
      const determineQuality = (source: any): string => {
        // Skip timestamp-like qualities
        if (source.quality && /^\d{10,}P?$/i.test(source.quality)) {
          return "Unknown";
        }

        // Check for valid quality formats
        if (source.quality && /^\d{3,4}[pP]$/i.test(source.quality)) {
          return source.quality.toUpperCase();
        }

        // Extract from URL
        const url = source.url || source.stream || "";
        const qualityMatch = url.match(/(\d{3,4})[pP]/i);
        if (qualityMatch) {
          return qualityMatch[1] + "P";
        }

        // Check file extension for quality indicators
        if (url.includes(".mp4")) return "HD";
        if (url.includes(".webm")) return "HD";

        return "Unknown";
      };

      // Helper to check if URL is playable
      const isPlayableUrl = (url: string): boolean => {
        if (!url || typeof url !== "string") return false;

        // Check for direct video files
        if (/\.(mp4|webm|mkv|avi|mov|m3u8)(\?|$)/i.test(url)) return true;

        // Check for nebula.to CDN
        if (url.includes("nebula.to")) return true;

        // Check for known streaming domains
        const streamingDomains = ["wootly", "luluvdo", "dood"];
        if (streamingDomains.some((domain) => url.includes(domain)))
          return true;

        return false;
      };

      // Process all sources
      const allLinks: StreamingLink[] = sources
        .filter((source: any) => {
          const url = source.url || source.stream;
          return url && isPlayableUrl(url);
        })
        .map((source: any) => ({
          quality: determineQuality(source),
          url: source.url || source.stream,
          server: source.source || source.server || "Wootly",
        }));

      if (allLinks.length === 0) {
        console.error(
          "[WOOTLY] No playable URLs found. Available sources:",
          sources,
        );
        throw new Error("No playable streams found from Wootly");
      }

      console.log("[WOOTLY] Playable links found:", allLinks.length);
      allLinks.forEach((link, idx) => {
        console.log(
          `  ${idx + 1}. [${link.quality}] ${link.server}: ${link.url.substring(0, 80)}...`,
        );
      });

      // Prioritize nebula.to sources (they're more reliable)
      const nebulaLinks = allLinks.filter((link) =>
        link.url.includes("nebula.to"),
      );
      const otherLinks = allLinks.filter(
        (link) => !link.url.includes("nebula.to"),
      );

      // Prefer MP4 over WebM
      const mp4Links = nebulaLinks.filter((link) => link.url.includes(".mp4"));
      const webmLinks = nebulaLinks.filter((link) =>
        link.url.includes(".webm"),
      );

      // Build priority list
      const linksToUse = [...mp4Links, ...webmLinks, ...otherLinks];

      if (linksToUse.length === 0) {
        throw new Error("No valid streams after filtering");
      }

      // Select best quality stream
      let defaultStream =
        linksToUse.find((link) => link.quality === "1080P") ||
        linksToUse.find((link) => link.quality === "720P") ||
        linksToUse.find((link) => link.quality === "HD") ||
        linksToUse.find((link) =>
          link.quality.toLowerCase().includes("auto"),
        ) ||
        linksToUse[0];

      console.log("[WOOTLY] Selected stream:", {
        quality: defaultStream.quality,
        server: defaultStream.server,
        url: defaultStream.url.substring(0, 80) + "...",
      });

      // Get headers from source
      const firstSourceWithUrl = sources.find(
        (s: any) =>
          s.url === defaultStream.url || s.stream === defaultStream.url,
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
                streamHeaders["User-Agent"] ||
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            }
          : undefined,
      };
    } else {
      throw new Error("Wootly returned no data or unsuccessful response");
    }
  } catch (error: any) {
    console.error("[WOOTLY] Error:", error.message);
    if (error.response) {
      console.error("[WOOTLY] Response status:", error.response.status);
      console.error("[WOOTLY] Response data:", error.response.data);
    }
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
  useWootly: boolean = false,
): Promise<StreamingInfo> {
  // Handle Vidfast source
  if (vidfastOnly) {
    if (!seasonNumber || !episodeNumber) {
      throw new Error(
        "Season and episode numbers are required for Vidfast streaming",
      );
    }
    const vidfastUrl = `${EXTRA_URL}/vidfast/${seriesId}/${seasonNumber}/${episodeNumber}`;
    const resp = await axios.get<{ success: boolean; data: any }>(vidfastUrl, {
      timeout: 15000,
    });
    if (!resp.data.success || !resp.data.data) {
      throw new Error("Vidfast failed");
    }
    // Fix: Access the data object directly, not as an array
    const { streamUrl } = resp.data.data;
    if (!streamUrl) {
      throw new Error("No stream URL found in Vidfast response");
    }
    return {
      streamUrl,
      selectedServer: { id: seriesId, name: "Vidfast" },
      availableQualities: [],
    };
  }

  // Handle fallback source
  if (useFallback) {
    if (!seasonNumber || !episodeNumber) {
      throw new Error(
        "Season and episode numbers are required for fallback streaming",
      );
    }
    return getEpisodeStreamingUrlFallback(
      seriesId,
      seasonNumber,
      episodeNumber,
    );
  }

  // wootly source
  if (useWootly) {
    if (!seasonNumber || !episodeNumber) {
      throw new Error("Season and Episode no are required");
    }
    return getWootlyStreamingUrl(
      seriesId,
      vidfastOnly,
      useFallback,
      useWootly,
      seasonNumber,
      episodeNumber,
    );
  }

  // Handle primary source
  try {
    if (!incomingSlug) {
      throw new Error(
        "Slug is required for season requests - provide slug or series title",
      );
    }
    // Clean existing watch- prefix if present
    const baseSlug = incomingSlug.replace(/^watch-/i, "");
    const watchSlug = formatWatchSlug(baseSlug);
    // Get series details for slug
    console.log(`[API] Fetching series details for ID: ${seriesId}`);
    const seriesDetail = await api.get<MovieDetailResponse>(
      `/movie/${incomingSlug}-${seriesId}`,
    );
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
      ? servers.find((s) => s.id === serverId)
      : servers.find((s) => s.isVidstream === true) ||
        servers.find((s) => s.name.toLowerCase().includes("vidcloud")) ||
        servers[0];
    if (!selectedServer?.id) {
      throw new Error("Invalid server selection");
    }
    // Get sources
    console.log(
      `[API] Fetching sources for episode: ${episodeId}, server: ${selectedServer.name}`,
    );
    const src = await api.get<SourcesResponse>(
      `/movie/${watchSlug}-${seriesId}/sources`,
      {
        params: {
          serverId: selectedServer.id,
          episodeId,
        },
      },
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
export async function getEpisodeTMBD(
  seriesId: string,
  seasonNumber: string,
): Promise<Episode[]> {
  try {
    const response = await axios.get(
      `${TMBD_URL}/tv/${seriesId}/season/${seasonNumber}`,
      {
        params: {
          api_key: TMBD_KEY,
          language: "en-US",
        },
      },
    );
    if (response.data && response.data.episodes) {
      return response.data.episodes.map((ep: any) => ({
        id: ep.id.toString(),
        number: ep.episode_number,
        title: ep.name,
        description: ep.overview,
        img: ep.still_path
          ? `https://image.tmdb.org/t/p/w500${ep.still_path}`
          : "",
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
  episodeNumber: string,
): Promise<StreamingInfo> {
  try {
    const fallbackUrl = `${EXTRA_URL}/tmdb/${seriesId}/${seasonNumber}/${episodeNumber}`;
    console.log(`[FALLBACK] Fetching episode stream from: ${fallbackUrl}`);

    const resp = await axios.get(fallbackUrl, { timeout: 15000 });

    if (resp.data && resp.data.success && Array.isArray(resp.data.data)) {
      const sources: any[] = resp.data.data;
      const m3u8Links: StreamingLink[] = sources
        .filter((source) => source.stream && source.stream.includes(".m3u8"))
        .map((source) => ({
          quality: source.quality || "auto",
          url: source.stream,
          server: source.server || "Unknown Server",
        }));

      if (m3u8Links.length === 0) {
        // Optional: Check for non-m3u8 links if no m3u8 found
        const otherLinks: StreamingLink[] = sources.map((source) => ({
          quality: source.quality || "auto",
          url: source.stream,
          server: source.server || "Unknown Server",
        }));
        if (otherLinks.length > 0) {
          console.warn(
            "No .m3u8 links found, using first available link from extractor.",
          );
          const firstLink = otherLinks[0];
          return {
            streamUrl: firstLink.url,
            subtitles: [],
            selectedServer: { id: seriesId, name: firstLink.server },
            name: sources[0]?.name || `S${seasonNumber}E${episodeNumber}`,
            availableQualities: otherLinks,
          };
        }
        throw new Error(
          "No playable .m3u8 (or any other) stream links found from extractor.",
        );
      }

      let defaultStream =
        m3u8Links.find((link) => link.quality === "1080p") ||
        m3u8Links.find((link) => link.quality === "720p") ||
        m3u8Links.find((link) => link.quality.toLowerCase() === "auto") ||
        m3u8Links[0];

      return {
        streamUrl: defaultStream.url,
        subtitles: [],
        selectedServer: { id: seriesId, name: defaultStream.server },
        name: sources[0]?.name || `S${seasonNumber}E${episodeNumber}`,
        availableQualities: m3u8Links,
      };
    } else {
      throw new Error(
        `Fallback extractor returned no data or unsuccessful response for ${fallbackUrl}`,
      );
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
  slugify,
};
