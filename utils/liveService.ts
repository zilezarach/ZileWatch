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
const CACHE_DURATION = 60 * 60 * 1000; // 10 minutes
const REQUEST_TIMEOUT = 15000; // A Minute
const MAX_RETRIES = 4;

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
          "User-Agent": "ZileWatch/1.0",
          Accept: "*/*",
          "Cache-Control": "max-age=300",
          Connection: "keep-alive",
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);
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
      const delay = Math.min(500 * Math.pow(1.5, i), 5000);
      console.log(`⏳ Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Unexpected error in fetchWithRetry");
}

/**
 * Main function to fetch live sports data from CricHD
 */
export async function fetchLiveSports(): Promise<LiveItem[]> {
  try {
    console.log("🏈 Starting fetchLiveSports with CricHD...");
    return await fetchCricHDChannels();
  } catch (error) {
    console.error("❌ Error fetching live sports:", error);
    throw new Error(
      `Failed to load live sports: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

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
 * Fetch channels from CricHD service
 */
async function fetchCricHDChannels(): Promise<LiveItem[]> {
  try {
    console.log("📡 Fetching CricHD channels...");
    const url = `${API}/crichd/json`;
    console.log("🌐 CricHD API URL:", url);

    const res = await fetchWithRetry(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    console.log(
      "📦 Raw CricHD API response:",
      JSON.stringify(data).substring(0, 500),
    );

    // The CricHD API returns { success: [...], failed: [...] }
    if (!data?.success || !Array.isArray(data.success)) {
      console.error("❌ Invalid CricHD response structure:", data);
      throw new Error(
        "Invalid CricHD API response: missing or invalid success array",
      );
    }

    console.log(`✅ Received ${data.success.length} streams from CricHD API`);

    const liveItems: LiveItem[] = data.success.map(
      (stream: any, index: number) => {
        if (!stream.channelName) {
          console.warn("⚠️ Invalid stream data:", stream);
          throw new Error("Invalid stream data: missing required fields");
        }

        const category = extractCategoryFromName(stream.channelName);
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        return {
          id: stream.channelName.replace(/\s+/g, "_").toLowerCase(),
          match: stream.channelName,
          category: category,
          start: now.toISOString(),
          end: tomorrow.toISOString(),
          logo: getChannelLogo(stream.channelName),
          channels: [
            {
              id: index + 1,
              name: stream.channelName,
              streamUrl: stream.m3u8Url || "",
            },
          ],
          isFeatured: false,
          source: "crichd" as const,
        };
      },
    );

    console.log(`✅ Successfully processed ${liveItems.length} live items`);
    return liveItems;
  } catch (error) {
    console.error("❌ Error fetching CricHD channels:", error);
    throw error;
  }
}
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
 * Get stream URL for CricHD channel
 */
export async function getStreamUrl(channelName: string): Promise<string> {
  if (!channelName) {
    throw new Error("Channel name is required");
  }

  console.log(`🎬 Getting stream URL for CricHD channel: ${channelName}`);

  // Check cache first
  const cachedStream = streamUrlCache.get(channelName);
  if (cachedStream && cachedStream.expires > Date.now()) {
    console.log(`💾 Using cached stream URL for ${channelName}`);
    return cachedStream.url;
  }

  try {
    const url = `${API}/crichd/channel/${encodeURIComponent(channelName)}`;
    const res = await fetchWithRetry(url);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data: StreamResponse = await res.json();
    console.log(
      `📡 CricHD Stream response for ${channelName}:`,
      data.status === "success" ? "✅ Success" : "❌ Failed",
    );

    if (data.status !== "success" || !data.m3u8Url) {
      throw new Error(data.error || "Invalid stream response: missing m3u8Url");
    }

    // Cache the stream URL
    const cacheEntry = {
      url: data.m3u8Url,
      expires: Date.now() + CACHE_DURATION,
    };
    streamUrlCache.set(channelName, cacheEntry);

    // Persist to AsyncStorage (fire and forget)
    AsyncStorage.setItem(
      `streamUrl_${channelName}`,
      JSON.stringify(cacheEntry),
    ).catch((error) =>
      console.warn(`⚠️ Failed to cache stream URL for ${channelName}:`, error),
    );

    console.log(`✅ Successfully got stream URL for ${channelName}`);
    return data.m3u8Url;
  } catch (error) {
    console.error(`❌ Error getting stream URL for ${channelName}:`, error);
    throw new Error(
      `Failed to get stream URL for ${channelName}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

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
}> {
  try {
    console.log("🔍 Testing CricHD API connectivity...");
    console.log("📡 API URL:", API);
    const response = await fetchWithRetry(`${API}/crichd/health`);
    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: `Connected successfully to CricHD service.`,
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
