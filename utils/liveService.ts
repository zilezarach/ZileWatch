import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Global caches and promises
const streamUrlCache = new Map<string, { url: string; expires: number }>();

// API endpoint configuration
export const API =
  Constants.expoConfig?.extra?.zileLive ||
  (Constants.manifest as any)?.extra?.zileLive ||
  "http://localhost:4500";

console.log("🔍 API URL being used:", API);

// Type definitions
export interface Channel {
  id: number;
  name: string;
  streamUrl: string;
}

export type Source = "viprow" | "dlhd";

export type SourceChannel = "cdn" | "Tv-Org";

export interface TVChannels {
  id: string;
  name: string;
  image: string;
  streamUrl: string;
  logo?: string;
  provider?: string;
}
export interface DLHDChannel {
  channelId: string;
  channelName: string;
  m3u8Url: string;
  proxyUrl: string;
  lastUpdated: number;
  isWorking: boolean;
}

export interface VipRowEvent {
  id: string;
  title: string;
  sport: string;
  time: string;
  isoTime: string;
  url: string;
  isLive: boolean;
  startsIn?: string;
  streamUrl: string;
}

export interface LiveItem {
  id: string;
  name?: string;
  match: string;
  category: string;
  start: string;
  logo: string;
  end: string;
  channels: Channel[];
  isFeatured?: boolean;
  source?: Source;
  streamUrl?: string;
}

export interface CDNLiveChannels {
  id: string;
  name: string;
  logo: string;
  provider: string;
  url: string;
  image?: string;
  streamUrl?: string;
}

// Constants
const CACHE_DURATION = 60 * 60 * 1000;
const REQUEST_TIMEOUT = 15000;
const MAX_RETRIES = 3;

/**
 * Enhanced fetch wrapper with retry logic
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = MAX_RETRIES,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener("abort", () => controller.abort(), {
          once: true,
        });
      }
    }

    try {
      console.log(`📡 Attempt ${i + 1}/${retries + 1}: ${url}`);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "User-Agent": "ZileWatch/2.0",
          Accept: "*/*",
          "Cache-Control": "max-age=300",
          Connection: "keep-alive",
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);
      console.log(`✅ Response: ${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`⚠️ Attempt ${i + 1} failed: ${lastError.message}`);

      if (lastError.name === "AbortError" || options.signal?.aborted) {
        throw lastError;
      }

      if (i === retries) break;

      const delay = Math.min(500 * Math.pow(1.5, i), 5000);
      console.log(`⏳ Retrying in ${delay}ms...`);
      await new Promise((res) => setTimeout(res, delay));
    }
  }

  throw new Error(
    `Network request failed after ${retries + 1} attempts: ${lastError?.message}`,
  );
}

/**
 * Fetch DLHD channels from backend
 */
export async function fetchDLHDChannels(
  signal?: AbortSignal,
): Promise<LiveItem[]> {
  try {
    console.log("📡 Fetching DLHD channels...");
    const url = `${API}/dlhd/streams`;

    const res = await fetchWithRetry(url, { signal });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();

    if (!data.success || !data.streams || !Array.isArray(data.streams)) {
      throw new Error("Invalid DLHD API response");
    }

    const liveItems: LiveItem[] = data.streams.map(
      (stream: DLHDChannel, index: number) => {
        const category = extractCategoryFromName(stream.channelName);
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        return {
          id: stream.channelId,
          match: stream.channelName,
          category: category,
          start: now.toISOString(),
          end: tomorrow.toISOString(),
          logo: getChannelLogo(stream.channelName),
          channels: [
            {
              id: parseInt(stream.channelId),
              name: stream.channelName,
              streamUrl: stream.proxyUrl,
            },
          ],
          isFeatured: false,
          source: "dlhd" as const,
          streamUrl: stream.proxyUrl,
        };
      },
    );

    console.log(`✅ Successfully loaded ${liveItems.length} DLHD channels`);
    return liveItems;
  } catch (error: any) {
    console.error("❌ Error fetching DLHD channels:", error);
    throw error;
  }
}

/**
 * Fetch VIPRow schedule from backend
 */
export async function fetchVipRowSchedule(
  signal?: AbortSignal,
): Promise<LiveItem[]> {
  try {
    console.log("📡 Fetching VIPRow schedule...");
    const url = `${API}/viprow/schedule`;

    const res = await fetchWithRetry(url, { signal });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();

    if (!data.success || !data.events || !Array.isArray(data.events)) {
      throw new Error("Invalid VIPRow API response");
    }

    const seen = new Set<string>();

    const liveItems: LiveItem[] = data.events
      .filter((event: VipRowEvent) => {
        if (seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
      })
      .map((event: VipRowEvent) => {
        const category = formatSportName(event.sport);
        const eventTime = new Date(
          event.isoTime.includes("Z") ? event.isoTime : event.isoTime + "Z",
        );
        const endTime = new Date(eventTime.getTime() + 4 * 60 * 60 * 1000);
        return {
          id: event.id,
          match: event.title,
          category: category,
          start: eventTime.toISOString(),
          end: endTime.toISOString(),
          logo: getSportLogo(event.sport),
          channels: [
            {
              id: 1,
              name: "VIPRow Stream",
              streamUrl: event.streamUrl,
            },
          ],
          isFeatured: event.isLive,
          source: "viprow" as const,
          streamUrl: event.streamUrl,
        };
      });

    console.log(`✅ Successfully loaded ${liveItems.length} VIPRow events`);
    return liveItems;
  } catch (error: any) {
    console.error("❌ Error fetching VIPRow schedule:", error);
    throw error;
  }
}

/**
 * Main function to fetch live sports data (DLHD + VIPRow)
 */
export async function fetchLiveSports(
  signal?: AbortSignal,
  source: Source = "viprow",
): Promise<LiveItem[]> {
  try {
    console.log(`📺 Fetching live sports from ${source.toUpperCase()}...`);

    let result: LiveItem[];

    if (source === "viprow") {
      result = await fetchVipRowSchedule(signal);
    } else {
      result = await fetchDLHDChannels(signal);
    }

    if (!result || result.length === 0) {
      console.warn(
        `⚠️ No live sports data received from ${source.toUpperCase()}`,
      );
      const cachedData = await getCachedLiveSports(source);
      if (cachedData.length > 0) {
        console.log(`📦 Returning ${cachedData.length} cached sports items`);
        return cachedData;
      }
      return [];
    }

    await cacheLiveSports(result, source);
    console.log(
      `✅ Successfully loaded ${result.length} ${source.toUpperCase()} items`,
    );
    return result;
  } catch (error) {
    console.error("❌ Error fetching live sports:", error);

    if (
      error instanceof Error &&
      (error.message.includes("network") || error.message.includes("fetch"))
    ) {
      const cachedData = await getCachedLiveSports(source);
      if (cachedData.length > 0) {
        console.log(
          `📦 Fallback: Returning ${cachedData.length} cached sports items`,
        );
        return cachedData;
      }
    }

    throw new Error(
      `Failed to load live sports: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Get stream URL (works for both DLHD and VIPRow)
 */
export async function getStreamUrl(
  channelId: string,
  signal?: AbortSignal,
  streamUrl?: string,
): Promise<string> {
  if (!channelId?.trim()) {
    throw new Error("Channel ID is required");
  }

  const cleanChannelId = channelId.trim();
  console.log(`🎬 Getting stream URL for channel: ${cleanChannelId}`);

  // If streamUrl is already provided (from cache), use it
  if (streamUrl) {
    console.log("✅ Using provided stream URL");
    return streamUrl;
  }

  // Check cache
  const cacheKey = `stream_${cleanChannelId}`;
  const cachedStream = streamUrlCache.get(cacheKey);
  if (cachedStream && cachedStream.expires > Date.now()) {
    console.log(`💾 Using cached stream URL for ${cleanChannelId}`);
    return cachedStream.url;
  }

  try {
    // Determine if it's DLHD or VIPRow based on ID format
    let url: string;
    if (cleanChannelId.startsWith("viprow-")) {
      // VIPRow events already have streamUrl in the event data
      throw new Error("VIPRow stream URL should be provided directly");
    } else {
      // DLHD channel
      const dlhdUrl = `${API}/dlhd/channel/${encodeURIComponent(cleanChannelId)}`;
      const res = await fetchWithRetry(dlhdUrl, { signal });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      if (!data.success || !data.stream?.proxyUrl) {
        throw new Error("No stream URL found");
      }

      url = data.stream.proxyUrl;
    }

    // Cache the result
    const cacheEntry = {
      url,
      expires: Date.now() + CACHE_DURATION,
    };
    streamUrlCache.set(cacheKey, cacheEntry);

    console.log(`✅ Successfully got stream URL for ${cleanChannelId}`);
    return url;
  } catch (error) {
    console.error(`❌ Error getting stream URL:`, error);

    // Try stale cache
    const staleCache = streamUrlCache.get(cacheKey);
    if (staleCache) {
      console.log(`🔄 Using stale cache for ${cleanChannelId}`);
      return staleCache.url;
    }

    throw error;
  }
}

/**
 * Get cached live sports from AsyncStorage
 */
async function getCachedLiveSports(source: Source): Promise<LiveItem[]> {
  try {
    const cacheKey = `cachedLiveSports_${source}`;
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      const isExpired = Date.now() - parsed.timestamp > CACHE_DURATION;
      if (!isExpired && Array.isArray(parsed.data)) {
        console.log(
          `📦 Retrieved ${parsed.data.length} cached live sports from ${source}`,
        );
        return parsed.data;
      } else {
        console.log(`⏰ Cached live sports from ${source} expired`);
      }
    }
  } catch (error) {
    console.warn(`⚠️ Failed to get cached live sports from ${source}:`, error);
  }
  return [];
}

/**
 * Cache live sports to AsyncStorage
 */
async function cacheLiveSports(
  data: LiveItem[],
  source: Source,
): Promise<void> {
  try {
    const cacheKey = `cachedLiveSports_${source}`;
    await AsyncStorage.setItem(
      cacheKey,
      JSON.stringify({
        data,
        timestamp: Date.now(),
        source,
        version: "2.0",
      }),
    );
    console.log(`💾 Cached ${data.length} live sports items for ${source}`);
  } catch (error) {
    console.warn(`⚠️ Failed to cache live sports for ${source}:`, error);
  }
}

/**
 * Format sport name for display
 */
function formatSportName(sport: string): string {
  const sportMap: { [key: string]: string } = {
    football: "Football",
    soccer: "Football",
    basketball: "Basketball",
    nba: "NBA",
    tennis: "Tennis",
    baseball: "Baseball",
    hockey: "Hockey",
    mma: "MMA",
    boxing: "Boxing",
    f1: "Formula 1",
    "formula-1": "Formula 1",
    golf: "Golf",
    rugby: "Rugby",
    cricket: "Cricket",
  };

  const normalized = sport.toLowerCase().replace(/[_-]/g, " ").trim();
  return sportMap[normalized] || sport.charAt(0).toUpperCase() + sport.slice(1);
}

/**
 * Get sport logo URL
 */
function getSportLogo(sport: string): string {
  const sportLogos: { [key: string]: string } = {
    football:
      "https://upload.wikimedia.org/wikipedia/en/e/e3/Premier_League_Logo.svg",
    soccer:
      "https://upload.wikimedia.org/wikipedia/en/e/e3/Premier_League_Logo.svg",
    basketball:
      "https://upload.wikimedia.org/wikipedia/en/0/03/National_Basketball_Association_logo.svg",
    nba: "https://upload.wikimedia.org/wikipedia/en/0/03/National_Basketball_Association_logo.svg",
    tennis:
      "https://upload.wikimedia.org/wikipedia/en/3/3e/Tennis_pictogram.svg",
    baseball:
      "https://upload.wikimedia.org/wikipedia/en/a/a6/Major_League_Baseball_logo.svg",
    hockey:
      "https://upload.wikimedia.org/wikipedia/en/3/3a/National_Hockey_League_logo.svg",
    f1: "https://upload.wikimedia.org/wikipedia/commons/3/33/F1.svg",
    "formula-1": "https://upload.wikimedia.org/wikipedia/commons/3/33/F1.svg",
  };

  return (
    sportLogos[sport.toLowerCase()] ||
    "https://via.placeholder.com/150x150?text=Live+Sport"
  );
}

/**
 * Fetch TV channels from API
 */
export async function fetchChannels(
  signal?: AbortSignal,
  source: SourceChannel = "Tv-Org",
): Promise<TVChannels[]> {
  try {
    console.log("📺 Fetching TV channels...");
    const url = `${API}/streams/channels`;

    const res = await fetchWithRetry(url, { signal });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const json = await res.json();

    let channelsArray: any[] = [];

    if (json?.channels && Array.isArray(json.channels)) {
      channelsArray = json.channels;
    } else if (json?.data?.channels && Array.isArray(json.data.channels)) {
      channelsArray = json.data.channels;
    } else if (Array.isArray(json)) {
      channelsArray = json;
    }

    const validChannels = channelsArray
      .map((channel, index) => {
        if (!channel || typeof channel !== "object") return null;
        if (!channel.name && !channel.id) return null;

        return {
          id: String(channel.id ?? index),
          name: channel.name || `Channel ${index + 1}`,
          image: channel.image || channel.logo || "",
          streamUrl: channel.streamUrl || channel.url || "",
        };
      })
      .filter((channel): channel is TVChannels => channel !== null);

    await cacheChannels(validChannels, source);
    return validChannels;
  } catch (error) {
    console.error("❌ Error fetching channels:", error);
    const cachedChannels = await getCachedChannels(source);
    if (cachedChannels.length > 0) {
      return cachedChannels;
    }
    throw error;
  }
}

export async function fetchCDNChannels(
  signal?: AbortSignal,
): Promise<TVChannels[]> {
  try {
    console.log("Fetching CDNLiveChannels....");
    const url = `${API}/cdn/channels`;

    const res = await fetchWithRetry(url, { signal });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const json = await res.json();

    let channels: any[] = [];

    if (json?.channels) channels = json.channels;
    else if (Array.isArray(json)) channels = json;
    const validChannels = channels.map((channel, index) => ({
      id: String(channel.id ?? index),
      name: channel.name,
      logo: channel.logo,
      provider: channel.provider,
      url: channel.url,
      image: channel.image || channel.logo || "",
      streamUrl: channel.streamUrl || channel.url || "",
    }));
    return validChannels;
  } catch (error: any) {
    console.error("Unable to fetch channels", error);
    throw error;
  }
}

//Get Both Channel Providers Fethed
export async function fetchAllChannels(
  signal?: AbortSignal,
  source: SourceChannel = "cdn",
): Promise<TVChannels[]> {
  try {
    console.log(`📺 Fetching live sports from ${source.toUpperCase()}...`);
    let result: TVChannels[];
    if (source === "cdn") {
      result = await fetchCDNChannels(signal);
    } else {
      result = await fetchChannels(signal);
    }
    if (!result || result.length === 0) {
      console.warn(
        `⚠️ No live sports data received from ${source.toUpperCase()}`,
      );
      const cachedData = await getCachedChannels(source);
      if (cachedData.length > 0) {
        console.log(`📦 Returning ${cachedData.length} cached sports items`);
        return cachedData;
      }
      return result;
    }
    await cacheChannels(result, source);
    return result;
  } catch (err) {
    console.error("Unable to fetch Channels from all Providers", err);
    return [];
  }
}

export async function getPreferredSource(): Promise<Source> {
  try {
    const stored = await AsyncStorage.getItem("preferredSource");
    if (stored && (stored === "dlhd" || stored === "viprow")) {
      return stored as Source;
    }
  } catch (error) {
    console.warn("⚠️ Failed to get preferred source:", error);
  }
  return "viprow";
}

//preferredSource for TV channels
export async function getPreferredCHsource(): Promise<SourceChannel> {
  try {
    const stored = await AsyncStorage.getItem("preferredCHSource");
    if (stored && (stored === "cdn" || stored === "Tv-Org")) {
      return stored as SourceChannel;
    }
  } catch (error: any) {
    console.warn("Failed to get Preffered Source", error);
  }
  return "cdn";
}

export async function setPreferredSource(source: Source): Promise<void> {
  try {
    await AsyncStorage.setItem("preferredSource", source);
    console.log(`💾 Saved preferred source: ${source}`);
  } catch (error) {
    console.warn("⚠️ Failed to save preferred source:", error);
  }
}

//Set Preffered Source to CDN

export async function setPreferredCHSource(
  source: SourceChannel,
): Promise<void> {
  try {
    await AsyncStorage.setItem("preferredCHSource", source);
  } catch (error: any) {
    console.warn("Failed to save preferred Channel Source", error);
  }
}

/**
 * Get TV channel stream URL
 */
export async function getChannelsStream(
  id: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!id?.trim()) {
    throw new Error("Channel ID is required");
  }

  const cleanId = id.trim();
  console.log(`📺 Getting channels stream for ID: ${cleanId}`);

  const cachedStream = streamUrlCache.get(cleanId);
  if (cachedStream && cachedStream.expires > Date.now()) {
    console.log(`💾 Using cached channels stream URL for ${cleanId}`);
    return cachedStream.url;
  }

  try {
    const url = `${API}/streams/channel/${encodeURIComponent(cleanId)}`;
    const res = await fetchWithRetry(url, { signal });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    const streamUrl = data.streamUrl || data.m3u8Url;

    if (!streamUrl) {
      throw new Error("No stream URL provided");
    }

    const cacheEntry = {
      url: streamUrl,
      expires: Date.now() + CACHE_DURATION,
    };
    streamUrlCache.set(cleanId, cacheEntry);

    return streamUrl;
  } catch (error) {
    console.error(`❌ Error getting channels stream URL:`, error);
    throw error;
  }
}

export async function getCDNStream(
  id: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!id?.trim()) {
    throw new Error("Channel ID is required");
  }
  const cleanId = id.trim();
  console.log(`📺 Getting channels stream for ID: ${cleanId}`);
  try {
    const url = `${API}/cdn/channel/${encodeURIComponent(cleanId)}`;
    const res = await fetchWithRetry(url, { signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    const streamUrl = data.m3u8Url || data.proxyUrl;
    if (!streamUrl) {
      throw new Error("No stream URL provided");
    }
    return streamUrl;
  } catch (error: any) {
    console.error("Unable to fetch Channel Stream", error);
    throw error;
  }
}

//Get all Channels Streams
export async function getAllChannelsStreams(
  id: string,
  signal?: AbortSignal,
  fallbackStreamUrl?: string,
): Promise<string> {
  if (!id?.trim()) {
    throw new Error("Id is required");
  }
  const cleanId = id.trim();
  console.log("Get Streams for Both Sources");
  const preffered = await getPreferredCHsource();
  //Helper for CDN
  const fetchCDN = async (): Promise<string> => {
    const url = `${API}/cdn/channel/${encodeURIComponent(cleanId)}`;
    const res = await fetchWithRetry(url, { signal });

    if (!res.ok) {
      throw new Error(`CDN HTTP ${res.status}`);
    }

    const data = await res.json();
    const streamUrl = data?.m3u8Url || data?.stream?.m3u8Url || data?.proxyUrl;

    if (!streamUrl) throw new Error("CDN: No stream URL");

    return streamUrl;
  };
  // Helper to fetch TV-Org
  const fetchTVOrg = async (): Promise<string> => {
    return await getChannelsStream(cleanId, signal);
  };
  try {
    if (preffered === "cdn") {
      try {
        return await fetchCDN();
      } catch (error: any) {
        console.warn("Failed To Stream for CDN using TV-ORG", error);
        return await fetchTVOrg();
      }
    } else {
      try {
        return await fetchTVOrg();
      } catch (err) {
        console.warn("⚠️ TV-Org failed, falling back to CDN...");
        return await fetchCDN();
      }
    }
  } catch (error: any) {
    console.error("Error getting StreamUrl", error);
    if (fallbackStreamUrl) {
      console.warn("⚠️ Using fallback stream URL");
      return fallbackStreamUrl;
    }
    throw error;
  }
}

async function getCachedChannels(source: SourceChannel): Promise<TVChannels[]> {
  try {
    const cacheKey = `cachedChannels_${source}`;
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      const isExpired = Date.now() - parsed.timestamp > CACHE_DURATION;
      if (!isExpired && Array.isArray(parsed.data)) {
        return parsed.data;
      }
    }
  } catch (error) {
    console.warn("⚠️ Failed to get cached channels:", error);
  }
  return [];
}

async function cacheChannels(
  data: TVChannels[],
  source: SourceChannel,
): Promise<void> {
  try {
    const cacheKey = `cachedChannels_${source}`;
    await AsyncStorage.setItem(
      cacheKey,
      JSON.stringify({
        data,
        timestamp: Date.now(),
      }),
    );
    console.log(`💾 Cached ${data.length} channels`);
  } catch (error) {
    console.warn("⚠️ Failed to cache channels:", error);
  }
}

/**
 * Get channel logo URL
 */
function getChannelLogo(channelName: string): string {
  const name = channelName.toLowerCase();
  const logoMap: { [key: string]: string } = {
    "sky sports":
      "https://logos-world.net/wp-content/uploads/2020/06/Sky-Sports-Logo.png",
    "tnt sports":
      "https://logos-world.net/wp-content/uploads/2023/08/TNT-Sports-Logo.png",
    "la liga":
      "https://upload.wikimedia.org/wikipedia/commons/1/13/LaLiga_EA_Sports_2023_Vertical_Logo.svg",
    "super sports":
      "https://upload.wikimedia.org/wikipedia/en/0/0d/SuperSport_logo.png",
    astro: "https://upload.wikimedia.org/wikipedia/commons/2/27/Astro_logo.png",
    "premier sports":
      "https://upload.wikimedia.org/wikipedia/en/b/bb/Premier_Sports_logo.png",
  };

  for (const [keyword, logo] of Object.entries(logoMap)) {
    if (name.includes(keyword)) {
      return logo;
    }
  }

  return "https://via.placeholder.com/150x150?text=Live";
}

/**
 * Extract category from channel name
 */
function extractCategoryFromName(channelName: string): string {
  const name = channelName.toLowerCase();
  const categoryMap: { [key: string]: string } = {
    football: "Football",
    soccer: "Football",
    f1: "Formula 1",
    premier: "Premier League",
    "la liga": "La Liga",
    sports: "Sports",
    sky: "Sky Sports",
    tnt: "TNT Sports",
    espn: "ESPN",
  };

  for (const [keyword, category] of Object.entries(categoryMap)) {
    if (name.includes(keyword)) {
      return category;
    }
  }
  return "Sports";
}

/**
 * Generate categories from live items data
 */
export function generateCategoriesFromData(liveItems: LiveItem[]): string[] {
  const categories = new Set<string>();
  liveItems.forEach((item) => {
    if (item.category) {
      categories.add(item.category);
    }
  });
  return Array.from(categories).sort();
}

/**
 * Preload sessions for channels
 */
export async function preloadSessions(channelIds: string[]): Promise<void> {
  if (!Array.isArray(channelIds) || channelIds.length === 0) {
    console.warn("⚠️ No channel IDs provided for preloading");
    return;
  }

  console.log(`🚀 Preloading ${channelIds.length} channels`);

  const results = await Promise.allSettled(
    channelIds.map(async (channelId) => {
      try {
        if (channelId.startsWith("viprow-")) {
          console.log(`ℹ️ Skipping preload for VIPRow event: ${channelId}`);
        } else {
          await getStreamUrl(channelId);
          console.log(`✅ Preloaded ${channelId}`);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to preload ${channelId}`);
      }
    }),
  );

  const successful = results.filter(
    (result) => result.status === "fulfilled",
  ).length;
  console.log(
    `🎯 Preloading completed: ${successful}/${channelIds.length} successful`,
  );
}

/**
 * Load cached streams from AsyncStorage
 */
export async function loadCachedStreams(): Promise<void> {
  try {
    console.log("💾 Loading cached streams...");
    const keys = await AsyncStorage.getAllKeys();
    const streamKeys = keys.filter(
      (key) => key.startsWith("streamUrl_") || key.startsWith("stream_"),
    );

    if (streamKeys.length === 0) {
      console.log("ℹ️ No cached streams found");
      return;
    }

    const streamItems = await AsyncStorage.multiGet(streamKeys);
    const expiredKeys: string[] = [];

    for (const [key, value] of streamItems) {
      if (value) {
        try {
          const { url, expires } = JSON.parse(value);
          const channelId = key
            .replace("streamUrl_", "")
            .replace("stream_", "");
          if (expires > Date.now()) {
            streamUrlCache.set(channelId, { url, expires });
          } else {
            expiredKeys.push(key);
          }
        } catch (parseError) {
          expiredKeys.push(key);
        }
      }
    }

    if (expiredKeys.length > 0) {
      await AsyncStorage.multiRemove(expiredKeys);
      console.log(`🧹 Removed ${expiredKeys.length} expired streams`);
    }

    console.log(`💾 Loaded ${streamUrlCache.size} cached streams`);
  } catch (error) {
    console.error("❌ Error loading cached streams:", error);
  }
}

/**
 * Clear all cached streams
 */
export async function clearStreamCache(): Promise<void> {
  try {
    console.log("🧹 Clearing stream cache...");
    streamUrlCache.clear();
    const keys = await AsyncStorage.getAllKeys();
    const streamKeys = keys.filter(
      (key) =>
        key.startsWith("streamUrl_") ||
        key.startsWith("stream_") ||
        key.startsWith("cachedLiveSports_"),
    );
    if (streamKeys.length > 0) {
      await AsyncStorage.multiRemove(streamKeys);
      console.log(`🧹 Cleared ${streamKeys.length} cached streams`);
    }
  } catch (error) {
    console.error("❌ Error clearing stream cache:", error);
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; entries: string[] } {
  return {
    size: streamUrlCache.size,
    entries: Array.from(streamUrlCache.keys()),
  };
}
