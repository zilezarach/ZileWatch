import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Global caches and promises
const streamUrlCache = new Map<string, { url: string; expires: number }>();

// API endpoint configuration
export const API =
  Constants.expoConfig?.extra?.zileLive || (Constants.manifest as any)?.extra?.zileLive || "http://localhost:4500";

console.log("🔍 API URL being used:", API);

// Type definitions
export interface Channel {
  id: number;
  name: string;
  streamUrl: string;
}

export type Source = "dlhd"; // Made to one source at the monment 

export interface TVChannels {
  id: number;
  name: string;
  image: string;
  streamUrl: string;
}

export interface DLHDChannel {
  channelId: string;
  channelName: string;
  m3u8Url: string;
  proxyUrl: string;
  lastUpdated: number;
  isWorking: boolean;
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

// Constants
const CACHE_DURATION = 60 * 60 * 1000;
const REQUEST_TIMEOUT = 15000;
const MAX_RETRIES = 3;

/**
 * Enhanced fetch wrapper with retry logic
 */
async function fetchWithRetry(url: string, options: RequestInit = {}, retries = MAX_RETRIES): Promise<Response> {
  let lastError: Error | null = null;

  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    // Forward external abort → internal controller
    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener("abort", () => controller.abort(), {
          once: true
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
          ...options.headers
        }
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
      await new Promise(res => setTimeout(res, delay));
    }
  }

  throw new Error(`Network request failed after ${retries + 1} attempts: ${lastError?.message}`);
}

/**
 * Fetch DLHD channels from backend
 */
export async function fetchDLHDChannels(signal?: AbortSignal): Promise<LiveItem[]> {
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

    const liveItems: LiveItem[] = data.streams.map((stream: DLHDChannel, index: number) => {
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
            streamUrl: stream.proxyUrl
          }
        ],
        isFeatured: false,
        source: "dlhd" as const,
        streamUrl: stream.proxyUrl
      };
    });

    console.log(`✅ Successfully loaded ${liveItems.length} DLHD channels`);
    return liveItems;
  } catch (error: any) {
    console.error("❌ Error fetching DLHD channels:", error);
    throw error;
  }
}

/**
 * Get DLHD stream URL for a specific channel
 */
export async function getDLHDStreamUrl(channelId: string, signal?: AbortSignal): Promise<string> {
  try {
    console.log(`🎬 Getting DLHD stream for channel: ${channelId}`);

    const url = `${API}/dlhd/channel/${encodeURIComponent(channelId)}`;
    const res = await fetchWithRetry(url, { signal });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();

    if (!data.success || !data.stream?.proxyUrl) {
      throw new Error("No stream URL found");
    }

    console.log(`✅ Got DLHD stream URL for channel ${channelId}`);
    return data.stream.proxyUrl;
  } catch (error: any) {
    console.error(`❌ Error getting DLHD stream:`, error);
    throw error;
  }
}

/**
 * Main function to fetch live sports data (now only DLHD)
 */
export async function fetchLiveSports(signal?: AbortSignal): Promise<LiveItem[]> {
  try {
    console.log("📺 Fetching live sports from DLHD...");

    const result = await fetchDLHDChannels(signal);

    if (!result || result.length === 0) {
      console.warn("⚠️ No live sports data received from DLHD");
      const cachedData = await getCachedLiveSports();
      if (cachedData.length > 0) {
        console.log(`📦 Returning ${cachedData.length} cached sports items`);
        return cachedData;
      }
      return [];
    }

    await cacheLiveSports(result);
    console.log(`✅ Successfully loaded ${result.length} DLHD channels`);
    return result;
  } catch (error) {
    console.error("❌ Error fetching live sports:", error);

    if (error instanceof Error && (error.message.includes("network") || error.message.includes("fetch"))) {
      const cachedData = await getCachedLiveSports();
      if (cachedData.length > 0) {
        console.log(`📦 Fallback: Returning ${cachedData.length} cached sports items`);
        return cachedData;
      }
    }

    throw new Error(`Failed to load live sports: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Get stream URL (simplified for DLHD only)
 */
export async function getStreamUrl(channelId: string, signal?: AbortSignal, streamUrl?: string): Promise<string> {
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
  const cacheKey = `dlhd_${cleanChannelId}`;
  const cachedStream = streamUrlCache.get(cacheKey);
  if (cachedStream && cachedStream.expires > Date.now()) {
    console.log(`💾 Using cached stream URL for ${cleanChannelId}`);
    return cachedStream.url;
  }

  try {
    const url = await getDLHDStreamUrl(cleanChannelId, signal);

    // Cache the result
    const cacheEntry = {
      url,
      expires: Date.now() + CACHE_DURATION
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
 * Helper function to generate stable IDs
 */
function generateStableId(channelName: string): string {
  return channelName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Get cached live sports from AsyncStorage
 */
async function getCachedLiveSports(): Promise<LiveItem[]> {
  try {
    const cached = await AsyncStorage.getItem("cachedLiveSports");
    if (cached) {
      const parsed = JSON.parse(cached);
      const isExpired = Date.now() - parsed.timestamp > CACHE_DURATION;
      if (!isExpired && Array.isArray(parsed.data)) {
        console.log(`📦 Retrieved ${parsed.data.length} cached live sports`);
        return parsed.data;
      } else {
        console.log("⏰ Cached live sports expired");
      }
    }
  } catch (error) {
    console.warn("⚠️ Failed to get cached live sports:", error);
  }
  return [];
}

/**
 * Cache live sports to AsyncStorage
 */
async function cacheLiveSports(data: LiveItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      "cachedLiveSports",
      JSON.stringify({
        data,
        timestamp: Date.now(),
        version: "2.0"
      })
    );
    console.log(`💾 Cached ${data.length} live sports items`);
  } catch (error) {
    console.warn("⚠️ Failed to cache live sports:", error);
  }
}

/**
 * Fetch TV channels from API (kept for compatibility)
 */
export async function fetchChannels(signal?: AbortSignal): Promise<TVChannels[]> {
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
          id: channel.id !== undefined ? channel.id : index,
          name: channel.name || `Channel ${index + 1}`,
          image: channel.image || channel.logo || "",
          streamUrl: channel.streamUrl || channel.url || ""
        };
      })
      .filter((channel): channel is TVChannels => channel !== null);

    await cacheChannels(validChannels);
    return validChannels;
  } catch (error) {
    console.error("❌ Error fetching channels:", error);
    const cachedChannels = await getCachedChannels();
    if (cachedChannels.length > 0) {
      return cachedChannels;
    }
    throw error;
  }
}

/**
 * Get TV channel stream URL
 */
export async function getChannelsStream(id: string, signal?: AbortSignal): Promise<string> {
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
      expires: Date.now() + CACHE_DURATION
    };
    streamUrlCache.set(cleanId, cacheEntry);

    return streamUrl;
  } catch (error) {
    console.error(`❌ Error getting channels stream URL:`, error);
    throw error;
  }
}

async function getCachedChannels(): Promise<TVChannels[]> {
  try {
    const cached = await AsyncStorage.getItem("cachedChannels");
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

async function cacheChannels(data: TVChannels[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      "cachedChannels",
      JSON.stringify({
        data,
        timestamp: Date.now()
      })
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
    "sky sports": "https://logos-world.net/wp-content/uploads/2020/06/Sky-Sports-Logo.png",
    "tnt sports": "https://logos-world.net/wp-content/uploads/2023/08/TNT-Sports-Logo.png",
    "la liga": "https://upload.wikimedia.org/wikipedia/commons/1/13/LaLiga_EA_Sports_2023_Vertical_Logo.svg",
    "super sports": "https://upload.wikimedia.org/wikipedia/en/0/0d/SuperSport_logo.png",
    astro: "https://upload.wikimedia.org/wikipedia/commons/2/27/Astro_logo.png",
    "premier sports": "https://upload.wikimedia.org/wikipedia/en/b/bb/Premier_Sports_logo.png"
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
    espn: "ESPN"
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
  liveItems.forEach(item => {
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

  console.log(`🚀 Preloading ${channelIds.length} DLHD channels`);

  const results = await Promise.allSettled(
    channelIds.map(async channelId => {
      try {
        await getDLHDStreamUrl(channelId);
        console.log(`✅ Preloaded ${channelId}`);
      } catch (error) {
        console.warn(`⚠️ Failed to preload ${channelId}`);
      }
    })
  );

  const successful = results.filter(result => result.status === "fulfilled").length;
  console.log(`🎯 Preloading completed: ${successful}/${channelIds.length} successful`);
}

/**
 * Load cached streams from AsyncStorage
 */
export async function loadCachedStreams(): Promise<void> {
  try {
    console.log("💾 Loading cached streams...");
    const keys = await AsyncStorage.getAllKeys();
    const streamKeys = keys.filter(key => key.startsWith("streamUrl_"));

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
          const channelId = key.replace("streamUrl_", "");
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
    const streamKeys = keys.filter(key => key.startsWith("streamUrl_"));
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
    entries: Array.from(streamUrlCache.keys())
  };
}
