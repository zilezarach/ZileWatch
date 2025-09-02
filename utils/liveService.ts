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
  source?: "gopst" | "streamed";
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
  channelId: string;
  streamUrl: string;
  proxyUrl: string;
  headers: Record<string, string>;
  mpvCommand: string;
  expoInstructions: string;
  sessionReady?: boolean;
  message?: string;
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
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes (increased)
const REQUEST_TIMEOUT = 30000; // 30 seconds (increased)
const MAX_RETRIES = 3;

/**
 * Enhanced fetch wrapper with retry logic and better error handling
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = MAX_RETRIES,
): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      console.log(`🌐 Attempt ${i + 1}/${retries + 1}: ${url}`);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "User-Agent": "ZileWatch/1.0 (Mobile App)",
          Accept: "*/*",
          "Cache-Control": "no-cache",
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      // Log response details
      console.log(
        `📡 Response: ${response.status} ${response.statusText} for ${url}`,
      );

      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      const isLastAttempt = i === retries;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      console.warn(`🚨 Attempt ${i + 1} failed for ${url}: ${errorMessage}`);

      if (isLastAttempt) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error(`Request timeout after ${REQUEST_TIMEOUT}ms`);
        }
        throw new Error(
          `Network request failed after ${retries + 1} attempts: ${errorMessage}`,
        );
      }

      // Progressive delay between retries
      const delay = Math.min(1000 * Math.pow(2, i), 5000);
      console.log(`⏳ Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("Unexpected error in fetchWithRetry");
}

/**
 * Main function to fetch live sports data
 */
export async function fetchLiveSports(): Promise<LiveItem[]> {
  try {
    console.log("🏈 Starting fetchLiveSports...");
    return await fetchRegularChannels();
  } catch (error) {
    console.error("❌ Error fetching live sports:", error);
    throw new Error(
      `Failed to load live sports: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Fetch regular channels from the API with better error handling
 */
async function fetchRegularChannels(): Promise<LiveItem[]> {
  try {
    console.log("📡 Fetching regular channels...");
    const url = `${API}/gopst/channels/list`;
    console.log("🌐 API URL:", url);

    const res = await fetchWithRetry(url);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    console.log("📦 Raw API response:", JSON.stringify(data).substring(0, 200));

    if (!data?.channels || !Array.isArray(data.channels)) {
      throw new Error(
        "Invalid API response: missing or invalid channels array",
      );
    }

    console.log(`✅ Received ${data.channels.length} channels from API`);

    const liveItems: LiveItem[] = data.channels.map(
      (channel: any, index: number) => {
        if (!channel.id || !channel.name) {
          console.warn("⚠️ Invalid channel data:", channel);
          throw new Error("Invalid channel data: missing required fields");
        }

        const category = extractCategoryFromName(channel.name);
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        return {
          id: String(channel.id),
          match: channel.name,
          category: category,
          start: now.toISOString(),
          end: tomorrow.toISOString(),
          logo: channel.logo || "https://via.placeholder.com/150x150?text=Live",
          channels: [
            {
              id: index + 1,
              name: channel.name,
              streamUrl: `${API}/gopst/channel/${channel.id}`,
            },
          ],
          isFeatured: false,
          source: "gopst" as const,
        };
      },
    );

    console.log(`✅ Successfully processed ${liveItems.length} live items`);
    return liveItems;
  } catch (error) {
    console.error("❌ Error fetching regular channels:", error);
    // Don't return empty array, let the error bubble up for better debugging
    throw error;
  }
}

/**
 * Extract category from channel name with improved logic
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
 * Fetch TV channels with enhanced error handling
 */
export async function fetchChannels(): Promise<TVChannels[]> {
  try {
    console.log("📺 Fetching TV channels...");
    const url = `${API}/streams/channels`;
    console.log("🌐 Channels API URL:", url);

    const res = await fetchWithRetry(url);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const json = await res.json();
    console.log(
      "📦 Channels response:",
      JSON.stringify(json).substring(0, 200),
    );

    if (!json?.channels || !Array.isArray(json.channels)) {
      throw new Error(
        "Invalid channels API response: missing or invalid channels array",
      );
    }

    console.log(`✅ Received ${json.channels.length} TV channels`);
    return json.channels;
  } catch (error) {
    console.error("❌ Error fetching channels:", error);
    throw error;
  }
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
 * Get stream URL with improved error handling and longer timeouts
 */
export async function getStreamUrl(channelId: string): Promise<string> {
  if (!channelId) {
    throw new Error("Channel ID is required");
  }

  console.log(`🎬 Getting stream URL for channel: ${channelId}`);

  // Check cache first
  const cachedStream = streamUrlCache.get(channelId);
  if (cachedStream && cachedStream.expires > Date.now()) {
    console.log(`💾 Using cached stream URL for ${channelId}`);
    return cachedStream.url;
  }

  try {
    const url = `${API}/gopst/channel/${channelId}`;
    const res = await fetchWithRetry(url);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data: StreamResponse = await res.json();
    console.log(
      `📡 Stream response for ${channelId}:`,
      data.success ? "✅ Success" : "❌ Failed",
    );

    if (!data.success || !data.proxyUrl) {
      throw new Error(
        data.message || "Invalid stream response: missing proxyUrl",
      );
    }

    // Cache the stream URL for longer in production
    const cacheEntry = {
      url: data.proxyUrl,
      expires: Date.now() + CACHE_DURATION,
    };

    streamUrlCache.set(channelId, cacheEntry);

    // Persist to AsyncStorage (fire and forget)
    AsyncStorage.setItem(
      `streamUrl_${channelId}`,
      JSON.stringify(cacheEntry),
    ).catch((error) =>
      console.warn(`⚠️ Failed to cache stream URL for ${channelId}:`, error),
    );

    console.log(`✅ Successfully got stream URL for ${channelId}`);
    return data.proxyUrl;
  } catch (error) {
    console.error(`❌ Error getting stream URL for ${channelId}:`, error);
    throw new Error(
      `Failed to get stream URL for ${channelId}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Get channels stream URL with improved error handling
 */
export async function getChannelsStream(id: string): Promise<string> {
  if (!id) {
    throw new Error("Channel ID is required");
  }

  console.log(`📺 Getting channels stream for ID: ${id}`);

  // Check cache first
  const cachedStream = streamUrlCache.get(id);
  if (cachedStream && cachedStream.expires > Date.now()) {
    console.log(`💾 Using cached channels stream URL for ${id}`);
    return cachedStream.url;
  }

  try {
    const url = `${API}/streams/channel/${id}`;
    const res = await fetchWithRetry(url);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data: StreamResponse = await res.json();
    console.log(
      `📡 Channels stream response for ${id}:`,
      data.streamUrl ? "✅ Success" : "❌ Failed",
    );

    if (!data.streamUrl) {
      throw new Error("No stream URL in response");
    }

    // Cache the stream URL
    const cacheEntry = {
      url: data.streamUrl,
      expires: Date.now() + CACHE_DURATION,
    };

    streamUrlCache.set(id, cacheEntry);

    // Persist to AsyncStorage (fire and forget)
    AsyncStorage.setItem(`streamUrl_${id}`, JSON.stringify(cacheEntry)).catch(
      (error) =>
        console.warn(
          `⚠️ Failed to cache channels stream URL for ${id}:`,
          error,
        ),
    );

    console.log(`✅ Successfully got channels stream URL for ${id}`);
    return data.streamUrl;
  } catch (error) {
    console.error(`❌ Error getting channels stream URL for ${id}:`, error);
    throw new Error(
      `Failed to get channels stream URL for ${id}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Preload stream URLs for multiple channels with better error handling
 */
export async function preloadStreamUrls(channelIds: string[]): Promise<void> {
  if (!Array.isArray(channelIds) || channelIds.length === 0) {
    console.warn("⚠️ No channel IDs provided for preloading");
    return;
  }

  console.log(`🚀 Preloading stream URLs for ${channelIds.length} channels`);

  // Process channels with a more conservative approach for production
  const results = await Promise.allSettled(
    channelIds.map(async (channelId) => {
      try {
        await getStreamUrl(channelId);
        console.log(`✅ Preloaded stream URL for ${channelId}`);
      } catch (error) {
        console.warn(
          `⚠️ Failed to preload stream URL for ${channelId}:`,
          error,
        );
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
 * Preload sessions and streams with conservative approach
 */
export async function preloadSessions(channelIds: string[]): Promise<void> {
  if (!Array.isArray(channelIds) || channelIds.length === 0) {
    console.warn("⚠️ No channel IDs provided for session preloading");
    return;
  }

  console.log(
    `🔄 Preloading sessions and streams for ${channelIds.length} channels`,
  );

  // Do sequential preloading for better reliability in production
  await preloadStreamUrls(channelIds);

  // Initialize sessions sequentially to avoid overwhelming the backend
  for (const channelId of channelIds) {
    try {
      await initializeSession(channelId);
      console.log(`✅ Preloaded session for ${channelId}`);
      // Small delay between session initializations
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.warn(`⚠️ Failed to preload session for ${channelId}:`, error);
    }
  }

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
          const channelId = key.replace("streamUrl_", "");

          if (expires > Date.now()) {
            streamUrlCache.set(channelId, { url, expires });
            console.log(`✅ Loaded cached stream URL for ${channelId}`);
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
 * Initialize session for a channel with improved error handling
 */
export async function initializeSession(
  channelId: string,
): Promise<StreamResponse> {
  if (!channelId) {
    throw new Error("Channel ID is required");
  }

  // Check if initialization is already in progress
  if (sessionInitPromises.has(channelId)) {
    console.log(
      `⏳ Session initialization already in progress for ${channelId}`,
    );
    return sessionInitPromises.get(channelId)!;
  }

  const initPromise = async (): Promise<StreamResponse> => {
    try {
      console.log(`🔐 Initializing session for channel: ${channelId}`);

      const url = `${API}/gopst/channel/${channelId}`;
      const res = await fetchWithRetry(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.message ||
            `Session initialization failed: HTTP ${res.status}`,
        );
      }

      const data: StreamResponse = await res.json();

      if (!data.success) {
        throw new Error(
          data.message || "Session initialization failed: success=false",
        );
      }

      if (!data.proxyUrl) {
        throw new Error("No proxy URL in session response");
      }

      // Cache the stream URL
      const cacheEntry = {
        url: data.proxyUrl,
        expires: Date.now() + CACHE_DURATION,
      };

      streamUrlCache.set(channelId, cacheEntry);

      // Persist to AsyncStorage (fire and forget)
      AsyncStorage.setItem(
        `streamUrl_${channelId}`,
        JSON.stringify(cacheEntry),
      ).catch((error) =>
        console.warn(`⚠️ Failed to cache stream URL for ${channelId}:`, error),
      );

      console.log(`✅ Session successfully initialized for ${channelId}`);
      return data;
    } catch (error) {
      console.error(`❌ Failed to initialize session for ${channelId}:`, error);
      throw error;
    } finally {
      sessionInitPromises.delete(channelId);
    }
  };

  const promise = initPromise();
  sessionInitPromises.set(channelId, promise);
  return promise;
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
}> {
  try {
    console.log("🔍 Testing API connectivity...");
    console.log("📡 API URL:", API);

    const response = await fetchWithRetry(`${API}/gopst/channels/list`);

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: `Connected successfully. Found ${data?.channels?.length || 0} channels.`,
      };
    } else {
      return {
        success: false,
        message: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Unknown connectivity error",
    };
  }
}
