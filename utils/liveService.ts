import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Global caches and promises
const sessionInitPromises = new Map<string, Promise<StreamResponse>>();
const streamUrlCache = new Map<string, { url: string; expires: number }>();

// API endpoint configuration
export const API =
  Constants.expoConfig?.extra?.zileLive ||
  (Constants.manifest as any)?.extra?.zileLive ||
  "https://live-zile.0xzile.sbs";

//log for API
console.log("🔍 API URL being used:", API);

// Type definitions
export interface Channel {
  id: number;
  name: string;
  streamUrl: string;
}

export interface TVChannels {
  id: number;
  name: string;
  image: string;
  streamUrl: string;
}

export interface Stream {
  streamNo: number;
  hd: boolean;
  viewers: number;
  m3u8: string | null;
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
  source?: "crichd" | "streamed";
  streams?: Stream[];
}

export interface SessionStatus {
  success: boolean;
  channelId: string;
  hasSession: boolean;
  lastUsed?: number;
  ageMinutes?: number;
}

export interface StreamResponse {
  success: boolean;
  channelName: string;
  channelUrl: string;
  status: "success" | "failed";
  m3u8Url?: string;
  streamUrl?: string;
  error?: string;
  timestamp?: string;
  processingTime?: number;
  metadata?: any;
}

export interface StreamedMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  time: string;
  image?: string;
  status: string;
}

// Constants - Increased timeouts for production
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
const REQUEST_TIMEOUT = 15000; // 15 seconds
const MAX_RETRIES = 3; // Reduced retries for faster feedback

/**
 * Enhanced fetch wrapper with retry logic and better error handling
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

    try {
      console.log(`🌐 Attempt ${i + 1}/${retries + 1}: ${url}`);

      // Combine external abort signal with timeout signal
      const combinedSignal = options.signal
        ? AbortSignal.any([options.signal, controller.signal])
        : controller.signal;

      const response = await fetch(url, {
        ...options,
        signal: combinedSignal,
        headers: {
          "User-Agent": "ZileWatch/1.0",
          Accept: "*/*",
          "Cache-Control": "max-age=300",
          Connection: "keep-alive",
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      // Check if the response was aborted by external signal
      if (options.signal?.aborted) {
        throw new Error("Request aborted by caller");
      }

      console.log(
        `📡 Response: ${response.status} ${response.statusText} for ${url}`,
      );
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error instanceof Error ? error : new Error(String(error));

      const isLastAttempt = i === retries;
      console.warn(
        `🚨 Attempt ${i + 1} failed for ${url}: ${lastError.message}`,
      );

      // Don't retry if the request was aborted by external signal
      if (options.signal?.aborted || lastError.name === "AbortError") {
        throw lastError;
      }

      if (isLastAttempt) {
        break;
      }

      // Progressive delay between retries
      const delay = Math.min(500 * Math.pow(1.5, i), 5000);
      console.log(`⏳ Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error(
    `Network request failed after ${retries + 1} attempts: ${lastError?.message || "Unknown error"}`,
  );
}

/**
 * Main function to fetch live sports data from CricHD
 */
export async function fetchLiveSports(
  signal?: AbortSignal,
): Promise<LiveItem[]> {
  try {
    console.log("🏈 Starting fetchLiveSports with CricHD...");
    const result = await fetchCricHDChannels(signal);

    if (!result || result.length === 0) {
      console.warn("⚠️ No live sports data received from API");
      // Try to return cached data if available
      const cachedData = await getCachedLiveSports();
      if (cachedData.length > 0) {
        console.log(`📦 Returning ${cachedData.length} cached sports items`);
        return cachedData;
      }
      return [];
    }

    console.log(`✅ Successfully fetched ${result.length} live sports`);
    return result;
  } catch (error) {
    console.error("❌ Error fetching live sports:", error);

    // Return cached data if available and error is network-related
    if (
      error instanceof Error &&
      (error.message.includes("network") || error.message.includes("fetch"))
    ) {
      const cachedData = await getCachedLiveSports();
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
        console.log(
          `📦 Retrieved ${parsed.data.length} cached live sports (age: ${Math.round((Date.now() - parsed.timestamp) / 60000)}min)`,
        );
        return parsed.data;
      } else {
        console.log("⏰ Cached live sports expired, will fetch fresh data");
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
        version: "1.0",
      }),
    );
    console.log(`💾 Cached ${data.length} live sports items`);
  } catch (error) {
    console.warn("⚠️ Failed to cache live sports:", error);
  }
}

/**
 * Fetch TV channels from API
 */
export async function fetchChannels(
  signal?: AbortSignal,
): Promise<TVChannels[]> {
  try {
    console.log("📺 Fetching TV channels...");
    const url = `${API}/streams/channels`;
    console.log("🌐 Channels API URL:", url);

    const res = await fetchWithRetry(url, { signal });

    if (!res.ok) {
      if (res.status === 503) {
        throw new Error(
          "Channel service temporarily unavailable. Please try again in a few minutes.",
        );
      } else if (res.status === 404) {
        throw new Error(
          "Channel service not found. Please check your connection.",
        );
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    let json: any;
    try {
      json = await res.json();
    } catch (parseError) {
      throw new Error("Invalid response format from channel service");
    }

    console.log("📦 Channels response structure:", {
      hasChannels: !!json?.channels,
      hasData: !!json?.data,
      isArray: Array.isArray(json),
      keys: Object.keys(json || {}),
    });

    // Handle different possible response formats
    let channelsArray: any[] = [];

    if (json?.channels && Array.isArray(json.channels)) {
      channelsArray = json.channels;
    } else if (json?.data?.channels && Array.isArray(json.data.channels)) {
      channelsArray = json.data.channels;
    } else if (Array.isArray(json)) {
      channelsArray = json;
    } else {
      console.error("❌ Unexpected channels response format:", json);
      throw new Error("Invalid channels API response format");
    }

    if (channelsArray.length === 0) {
      console.warn("⚠️ No channels found in response");
      // Try cached channels
      const cachedChannels = await getCachedChannels();
      if (cachedChannels.length > 0) {
        console.log(`📦 Returning ${cachedChannels.length} cached channels`);
        return cachedChannels;
      }
      return [];
    }

    // Validate and transform channel data
    const validChannels = channelsArray
      .map((channel, index) => {
        // Skip invalid entries
        if (!channel || typeof channel !== "object") {
          console.warn(
            `⚠️ Skipping invalid channel at index ${index}:`,
            channel,
          );
          return null;
        }

        // Validate required fields
        if (!channel.name && !channel.id) {
          console.warn(`⚠️ Skipping channel missing name and id:`, channel);
          return null;
        }

        return {
          id: channel.id !== undefined ? channel.id : index,
          name: channel.name || `Channel ${index + 1}`,
          image: channel.image || channel.logo || "",
          streamUrl: channel.streamUrl || channel.url || "",
        };
      })
      .filter((channel): channel is TVChannels => channel !== null);

    console.log(
      `✅ Processed ${validChannels.length}/${channelsArray.length} valid channels`,
    );

    // Cache the successful result
    await cacheChannels(validChannels);

    return validChannels;
  } catch (error) {
    console.error("❌ Error fetching channels:", error);

    // Try to return cached channels if available and error is network-related
    if (
      error instanceof Error &&
      (error.message.includes("network") ||
        error.message.includes("timeout") ||
        error.message.includes("fetch"))
    ) {
      const cachedChannels = await getCachedChannels();
      if (cachedChannels.length > 0) {
        console.log(
          `📦 Fallback: Returning ${cachedChannels.length} cached channels due to network error`,
        );
        return cachedChannels;
      }
    }

    throw error;
  }
}

/**
 * Get cached channels from AsyncStorage
 */
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

/**
 * Cache channels to AsyncStorage
 */
async function cacheChannels(data: TVChannels[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      "cachedChannels",
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
    "sky sports main event":
      "https://logos-world.net/wp-content/uploads/2020/06/Sky-Sports-Logo.png",
    "sky sports premier":
      "https://logos-world.net/wp-content/uploads/2020/06/Sky-Sports-Logo.png",
    "sky sports football":
      "https://logos-world.net/wp-content/uploads/2020/06/Sky-Sports-Logo.png",
    "sky sports f1":
      "https://logos-world.net/wp-content/uploads/2020/06/Sky-Sports-Logo.png",
    "la liga":
      "https://upload.wikimedia.org/wikipedia/commons/1/13/LaLiga_EA_Sports_2023_Vertical_Logo.svg",
    "super sports football":
      "https://upload.wikimedia.org/wikipedia/en/0/0d/SuperSport_logo.png",
    "tnt sports 1":
      "https://logos-world.net/wp-content/uploads/2023/08/TNT-Sports-Logo.png",
    "tnt sports 2":
      "https://logos-world.net/wp-content/uploads/2023/08/TNT-Sports-Logo.png",
    "tnt sports 3":
      "https://logos-world.net/wp-content/uploads/2023/08/TNT-Sports-Logo.png",
  };

  return logoMap[name] || "https://via.placeholder.com/150x150?text=Live";
}

/**
 * Fetch channels from CricHD service - FIXED VERSION
 */
async function fetchCricHDChannels(signal?: AbortSignal): Promise<LiveItem[]> {
  try {
    console.log("📡 Fetching CricHD channels...");
    const url = `${API}/crichd/json`;
    console.log("🌐 CricHD API URL:", url);

    const res = await fetchWithRetry(url, { signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const responseData = await res.json();
    console.log("📦 Raw CricHD API response structure:", {
      hasData: !!responseData,
      hasDataProperty: !!responseData?.data,
      hasDirectSuccess: !!responseData?.success,
      hasNestedSuccess: !!responseData?.data?.success,
      topLevelKeys: Object.keys(responseData || {}),
      dataKeys: responseData?.data ? Object.keys(responseData.data) : [],
    });

    // Handle the actual API response format: data.data.success
    let successArray: any[] = [];
    let failedArray: any[] = [];

    if (
      responseData?.data?.success &&
      Array.isArray(responseData.data.success)
    ) {
      // This is the correct format for your API
      successArray = responseData.data.success;
      failedArray = responseData.data.failed || [];
      console.log("✅ Using nested data format: data.data.success");
    } else if (responseData?.success && Array.isArray(responseData.success)) {
      // Fallback: direct success array
      successArray = responseData.success;
      failedArray = responseData.failed || [];
      console.log("✅ Using direct success format: data.success");
    } else {
      console.error("❌ Invalid CricHD response structure. Expected formats:");
      console.error("   Format 1: { data: { success: [...] } }");
      console.error("   Format 2: { success: [...] }");
      console.error("   Received:", responseData);
      throw new Error(
        "Invalid CricHD API response: missing success array in expected location",
      );
    }

    if (successArray.length === 0) {
      console.warn("⚠️ No successful channels found in API response");
      if (failedArray.length > 0) {
        console.warn(
          `⚠️ Found ${failedArray.length} failed channels:`,
          failedArray.slice(0, 3),
        );
      }
      return [];
    }

    console.log(
      `✅ Found ${successArray.length} successful streams, ${failedArray.length} failed`,
    );

    const liveItems: LiveItem[] = successArray.map(
      (stream: any, index: number) => {
        // Validate required fields
        if (!stream.channelName) {
          console.warn("⚠️ Invalid stream data missing channelName:", stream);
          throw new Error(
            `Invalid stream data at index ${index}: missing channelName`,
          );
        }

        // Validate that we have a valid m3u8 URL
        if (!stream.m3u8Url && !stream.streamUrl) {
          console.warn("⚠️ Stream missing both m3u8Url and streamUrl:", stream);
          // Don't throw error, just log warning and continue
        }

        const category = extractCategoryFromName(stream.channelName);
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        return {
          id: generateStableId(stream.channelName),
          match: stream.channelName,
          category: category,
          start: now.toISOString(),
          end: tomorrow.toISOString(),
          logo: getChannelLogo(stream.channelName),
          channels: [
            {
              id: index + 1,
              name: stream.channelName,
              streamUrl: stream.m3u8Url || stream.streamUrl || "",
            },
          ],
          isFeatured: false,
          source: "crichd" as const,
        };
      },
    );

    // Cache the successful result
    await cacheLiveSports(liveItems);

    console.log(
      `✅ Successfully processed ${liveItems.length} live items from CricHD`,
    );

    // Log the first few items for debugging
    if (liveItems.length > 0) {
      console.log(
        "📋 Sample processed items:",
        liveItems.slice(0, 2).map((item) => ({
          id: item.id,
          match: item.match,
          category: item.category,
          hasChannels: item.channels.length > 0,
          hasStreamUrl: !!item.channels[0]?.streamUrl,
        })),
      );
    }

    return liveItems;
  } catch (error) {
    console.error("❌ Error fetching CricHD channels:", error);
    throw error;
  }
}

/**
 * Extract category from channel name
 */
function extractCategoryFromName(channelName: string): string {
  const name = channelName.toLowerCase();
  const categoryMap: { [key: string]: string } = {
    premier: "Premier Sports",
    sky: "Sky Sports",
    fox: "Fox Sports",
    tnt: "TNT Sports",
    liga: "La Liga",
    espn: "ESPN",
    bein: "beIN Sports",
    nbc: "NBC Sports",
    cbs: "CBS Sports",
    sports: "Sports",
  };

  for (const [keyword, category] of Object.entries(categoryMap)) {
    if (name.includes(keyword)) {
      return category;
    }
  }
  return "Live TV";
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
 * Helper function to validate stream URLs
 */
function isValidStreamUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;

  try {
    const parsedUrl = new URL(url);
    return (
      (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") &&
      (url.includes(".m3u8") ||
        url.includes("stream") ||
        parsedUrl.pathname.includes("live") ||
        url.includes("playlist") ||
        url.includes("manifest"))
    );
  } catch {
    return false;
  }
}

/**
 * Get stream URL for CricHD channel
 */
export async function getStreamUrl(
  channelName: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!channelName?.trim()) {
    throw new Error("Channel name is required and cannot be empty");
  }

  const cleanChannelName = channelName.trim();
  console.log(`🎬 Getting stream URL for CricHD channel: ${cleanChannelName}`);

  // Check cache first
  const cachedStream = streamUrlCache.get(cleanChannelName);
  if (cachedStream && cachedStream.expires > Date.now()) {
    console.log(`💾 Using cached stream URL for ${cleanChannelName}`);
    return cachedStream.url;
  }

  try {
    const url = `${API}/crichd/channel/${encodeURIComponent(cleanChannelName)}`;
    const res = await fetchWithRetry(url, { signal });

    if (!res.ok) {
      // Handle specific HTTP errors
      if (res.status === 404) {
        throw new Error(`Channel "${cleanChannelName}" not found`);
      } else if (res.status === 503) {
        throw new Error(
          "Service temporarily unavailable, please try again later",
        );
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    let data: StreamResponse;
    try {
      data = await res.json();
    } catch (parseError) {
      throw new Error("Invalid response format from server");
    }

    console.log(`📡 CricHD Stream response for ${cleanChannelName}:`, {
      status: data.status,
      hasM3u8: !!data.m3u8Url,
      hasStreamUrl: !!data.streamUrl,
      hasError: !!data.error,
    });

    // Handle different response formats from optimized backend
    let streamUrl: string | null = null;

    if (data.status === "success" && data.m3u8Url) {
      streamUrl = data.m3u8Url;
    } else if (data.streamUrl) {
      streamUrl = data.streamUrl;
    } else if (data.status === "failed" && data.error) {
      // Check if it's a cache miss from optimized backend
      if (data.error.includes("not currently cached")) {
        throw new Error(
          `Stream not ready. The service is updating its cache. Please try again in 30-60 seconds.`,
        );
      }
      throw new Error(data.error);
    }

    if (!streamUrl) {
      throw new Error("No valid stream URL found in response");
    }

    // Validate URL format
    if (!isValidStreamUrl(streamUrl)) {
      throw new Error("Invalid stream URL format received");
    }

    // Cache the successful result
    const cacheEntry = {
      url: streamUrl,
      expires: Date.now() + CACHE_DURATION,
    };
    streamUrlCache.set(cleanChannelName, cacheEntry);

    // Persist to AsyncStorage (fire and forget)
    AsyncStorage.setItem(
      `streamUrl_${cleanChannelName}`,
      JSON.stringify(cacheEntry),
    ).catch((error) =>
      console.warn(
        `⚠️ Failed to cache stream URL for ${cleanChannelName}:`,
        error,
      ),
    );

    console.log(`✅ Successfully got stream URL for ${cleanChannelName}`);
    return streamUrl;
  } catch (error) {
    console.error(
      `❌ Error getting stream URL for ${cleanChannelName}:`,
      error,
    );

    // Try to return stale cache if available and error is network-related
    const staleCache = streamUrlCache.get(cleanChannelName);
    if (
      staleCache &&
      error instanceof Error &&
      error.message.includes("network")
    ) {
      console.log(
        `🔄 Using stale cache for ${cleanChannelName} due to network error`,
      );
      return staleCache.url;
    }

    throw new Error(
      `Failed to get stream URL for ${cleanChannelName}: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
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
    throw new Error("Channel ID is required and cannot be empty");
  }

  const cleanId = id.trim();
  console.log(`📺 Getting channels stream for ID: ${cleanId}`);

  // Check cache first
  const cachedStream = streamUrlCache.get(cleanId);
  if (cachedStream && cachedStream.expires > Date.now()) {
    console.log(`💾 Using cached channels stream URL for ${cleanId}`);
    return cachedStream.url;
  }

  try {
    const url = `${API}/streams/channel/${encodeURIComponent(cleanId)}`;
    const res = await fetchWithRetry(url, { signal });

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`Channel with ID "${cleanId}" not found`);
      } else if (res.status === 503) {
        throw new Error("Channel service temporarily unavailable");
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    let data: StreamResponse;
    try {
      data = await res.json();
    } catch (parseError) {
      throw new Error("Invalid response format from channel service");
    }

    console.log(`📡 Channels stream response for ${cleanId}:`, {
      hasStreamUrl: !!data.streamUrl,
      hasM3u8: !!data.m3u8Url,
      status: data.status || "unknown",
    });

    const streamUrl = data.streamUrl || data.m3u8Url;
    if (!streamUrl) {
      throw new Error("No stream URL provided by channel service");
    }

    // Validate URL format
    if (!isValidStreamUrl(streamUrl)) {
      throw new Error("Invalid stream URL format from channel service");
    }

    // Cache the successful result
    const cacheEntry = {
      url: streamUrl,
      expires: Date.now() + CACHE_DURATION,
    };
    streamUrlCache.set(cleanId, cacheEntry);

    // Persist to AsyncStorage
    AsyncStorage.setItem(
      `streamUrl_${cleanId}`,
      JSON.stringify(cacheEntry),
    ).catch((error) =>
      console.warn(
        `⚠️ Failed to cache channels stream URL for ${cleanId}:`,
        error,
      ),
    );

    console.log(`✅ Successfully got channels stream URL for ${cleanId}`);
    return streamUrl;
  } catch (error) {
    console.error(
      `❌ Error getting channels stream URL for ${cleanId}:`,
      error,
    );

    // Try stale cache for network errors
    const staleCache = streamUrlCache.get(cleanId);
    if (
      staleCache &&
      error instanceof Error &&
      error.message.includes("network")
    ) {
      console.log(`🔄 Using stale cache for channel ${cleanId}`);
      return staleCache.url;
    }

    throw new Error(
      `Failed to get channels stream URL for ${cleanId}: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

/**
 * Preload stream URLs for multiple channels with better error handling
 */
export async function preloadStreamUrls(channelNames: string[]): Promise<void> {
  if (!Array.isArray(channelNames) || channelNames.length === 0) {
    console.warn("⚠️ No channel names provided for preloading");
    return;
  }

  console.log(`🚀 Preloading stream URLs for ${channelNames.length} channels`);

  const results = await Promise.allSettled(
    channelNames.map(async (channelName) => {
      try {
        await getStreamUrl(channelName);
        console.log(`✅ Preloaded stream URL for ${channelName}`);
      } catch (error) {
        console.warn(
          `⚠️ Failed to preload stream URL for ${channelName}:`,
          error,
        );
      }
    }),
  );

  const successful = results.filter(
    (result) => result.status === "fulfilled",
  ).length;
  console.log(
    `🎯 Preloading completed: ${successful}/${channelNames.length} successful`,
  );
}

/**
 * Preload sessions and streams with conservative approach
 */
export async function preloadSessions(channelNames: string[]): Promise<void> {
  if (!Array.isArray(channelNames) || channelNames.length === 0) {
    console.warn("⚠️ No channel names provided for session preloading");
    return;
  }

  console.log(
    `🔄 Preloading sessions and streams for ${channelNames.length} channels`,
  );
  await preloadStreamUrls(channelNames);
  console.log("🎉 Session and stream preloading completed");
}

/**
 * Load cached streams from AsyncStorage
 */
export async function loadCachedStreams(): Promise<void> {
  try {
    console.log("💾 Loading cached streams from AsyncStorage...");
    const keys = await AsyncStorage.getAllKeys();
    const streamKeys = keys.filter((key) => key.startsWith("streamUrl_"));

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
          const channelName = key.replace("streamUrl_", "");
          if (expires > Date.now()) {
            streamUrlCache.set(channelName, { url, expires });
            console.log(`✅ Loaded cached stream URL for ${channelName}`);
          } else {
            expiredKeys.push(key);
          }
        } catch (parseError) {
          console.warn(
            `⚠️ Failed to parse cached stream for ${key}:`,
            parseError,
          );
          expiredKeys.push(key);
        }
      }
    }

    // Clean up expired entries
    if (expiredKeys.length > 0) {
      await AsyncStorage.multiRemove(expiredKeys);
      console.log(`🧹 Removed ${expiredKeys.length} expired stream URLs`);
    }

    console.log(
      `💾 Cache loading completed: ${streamUrlCache.size} streams in memory`,
    );
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
    const streamKeys = keys.filter((key) => key.startsWith("streamUrl_"));
    if (streamKeys.length > 0) {
      await AsyncStorage.multiRemove(streamKeys);
      console.log(`🧹 Cleared ${streamKeys.length} cached stream URLs`);
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

/**
 * Test connectivity to the API
 */
export async function testConnectivity(): Promise<{
  success: boolean;
  message: string;
  details?: any;
}> {
  try {
    console.log("🔍 Testing API connectivity...");
    console.log("📡 API URL:", API);

    // Test main CricHD endpoint
    const crichdHealthUrl = `${API}/crichd/health`;
    const crichdResponse = await fetchWithRetry(crichdHealthUrl, {}, 1); // Single attempt for quick test

    if (crichdResponse.ok) {
      const data = await crichdResponse.json();
      return {
        success: true,
        message: "Connected successfully to CricHD service",
        details: {
          endpoint: crichdHealthUrl,
          status: crichdResponse.status,
          responseTime: "< 1s",
          cacheStatus: data?.cache?.status || "unknown",
        },
      };
    } else {
      return {
        success: false,
        message: `CricHD service returned HTTP ${crichdResponse.status}: ${crichdResponse.statusText}`,
        details: {
          endpoint: crichdHealthUrl,
          status: crichdResponse.status,
          statusText: crichdResponse.statusText,
        },
      };
    }
  } catch (error) {
    console.error("❌ Connectivity test failed:", error);

    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Unknown connectivity error",
      details: {
        error: error instanceof Error ? error.message : "Unknown error",
        endpoint: `${API}/crichd/health`,
        suggestion: "Check network connection and API server status",
      },
    };
  }
}

/**
 * Temporary test function for debugging API response parsing
 */
export async function testApiResponseParsing(): Promise<number> {
  try {
    const response = await fetch(`${API}/crichd/json`);
    const data = await response.json();

    console.log("🧪 API Test Results:");
    console.log("✅ API Response received");
    console.log("📊 Response structure:", {
      hasData: !!data.data,
      hasDirectSuccess: !!data.success,
      hasNestedSuccess: !!data.data?.success,
      successCount: data.data?.success?.length || 0,
      firstChannel: data.data?.success?.[0]?.channelName || "None",
    });

    return data.data?.success?.length || 0;
  } catch (error) {
    console.error("❌ API Test failed:", error);
    return 0;
  }
}
