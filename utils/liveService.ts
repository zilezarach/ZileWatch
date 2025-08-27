import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
const sessionInitPromises = new Map<string, Promise<StreamResponse>>();

const streamUrlCache = new Map<string, { url: string; expires: number }>();

export const API =
  Constants.expoConfig?.extra?.zileLive ||
  (Constants.manifest as any)?.extra?.zileLive ||
  "https://live-zile.0xzile.sbs";

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

export async function fetchLiveSports(): Promise<LiveItem[]> {
  try {
    const [featured, regular] = await Promise.allSettled([
      fetchFeaturedMatches(),
      fetchRegularChannels(),
    ]);

    const featuredMatches =
      featured.status === "fulfilled" ? featured.value : [];
    const regularChannels = regular.status === "fulfilled" ? regular.value : [];

    return [...featuredMatches, ...regularChannels];
  } catch (error) {
    console.error("Error fetching live sports:", error);
    throw new Error("Failed to load live sports");
  }
}

async function fetchRegularChannels(): Promise<LiveItem[]> {
  try {
    const res = await fetch(`${API}/gopst/channels/list`);
    if (!res.ok) throw new Error("Failed to load channels");

    const data = await res.json();

    const liveItems: LiveItem[] = data.channels.map(
      (channel: any, index: number) => {
        const category = extractCategoryFromName(channel.name);

        return {
          id: channel.id,
          match: channel.name,
          category: category,
          start: new Date().toISOString(),
          end: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          logo: channel.logo,
          channels: [
            {
              id: index + 1,
              name: channel.name,
              streamUrl: `${API}/gopst/channel/${channel.id}`,
            },
          ],
          isFeatured: false,
          source: "gopst",
        };
      },
    );

    return liveItems;
  } catch (error) {
    console.error("Error fetching regular channels:", error);
    return [];
  }
}

function extractCategoryFromName(channelName: string): string {
  if (channelName.toLowerCase().includes("sports")) {
    return "Sports";
  } else if (channelName.toLowerCase().includes("premier")) {
    return "Premier Sports";
  } else if (channelName.toLowerCase().includes("sky")) {
    return "Sky Sports";
  } else if (channelName.toLowerCase().includes("fox")) {
    return "Fox Sports";
  } else if (channelName.toLowerCase().includes("tnt")) {
    return "TNT Sports";
  } else if (channelName.toLowerCase().includes("liga")) {
    return "La Liga";
  } else {
    return "Live TV";
  }
}

export async function fetchChannels(): Promise<TVChannels[]> {
  const res = await fetch(`${API}/streams/channels`);
  if (!res.ok) throw new Error("Failed to fetch channels");
  const json = await res.json();
  return json.channels;
}

export function generateCategoriesFromData(liveItems: LiveItem[]): string[] {
  const categories = new Set<string>();

  const hasFeatured = liveItems.some((item) => item.isFeatured);
  if (hasFeatured) {
    categories.add("Featured");
  }

  liveItems.forEach((item) => {
    if (item.category && !item.isFeatured) {
      categories.add(item.category);
    }
  });

  return Array.from(categories).sort((a, b) => {
    if (a === "Featured") return -1;
    if (b === "Featured") return 1;
    return a.localeCompare(b);
  });
}

export async function getStreamUrl(channelId: string): Promise<string> {
  const cachedStream = streamUrlCache.get(channelId);
  if (cachedStream && cachedStream.expires > Date.now()) {
    console.log(`Using cached stream URL for ${channelId}`);
    return cachedStream.url;
  }
  try {
    const res = await fetch(`${API}/gopst/channel/${channelId}`);
    if (!res.ok) throw new Error("Failed to get stream URL");

    const data: StreamResponse = await res.json();
    if (!data.success || !data.proxyUrl) {
      throw new Error(data.message || "Invalid stream response");
    }

    // Cache the stream URL
    streamUrlCache.set(channelId, {
      url: data.proxyUrl,
      expires: Date.now() + 5 * 60 * 1000,
    });

    // Optionally persist to AsyncStorage
    await AsyncStorage.setItem(
      `streamUrl_${channelId}`,
      JSON.stringify({
        url: data.proxyUrl,
        expires: Date.now() + 5 * 60 * 1000,
      }),
    );

    return data.proxyUrl;
  } catch (error) {
    console.error("Error getting stream URL:", error);
    throw new Error("Failed to get stream URL");
  }
}

export async function getChannelsStream(id: string): Promise<string> {
  const cachedStream = streamUrlCache.get(id);
  if (cachedStream && cachedStream.expires > Date.now()) {
    console.log(`Using cached stream URL for channel ${id}`);
    return cachedStream.url;
  }
  try {
    console.log("Fetching stream for channel ID:", id);
    const res = await fetch(`${API}/streams/channel/${id}`);
    if (!res.ok) {
      console.error("Failed to get stream URL:", res.status, res.statusText);
      throw new Error("Failed to get Stream url");
    }
    const data: StreamResponse = await res.json();
    console.log("Stream URL response:", data);

    // Cache the stream URL
    streamUrlCache.set(id, {
      url: data.streamUrl,
      expires: Date.now() + 5 * 60 * 1000, // Cache for 5 minutes
    });

    // Optionally persist to AsyncStorage
    await AsyncStorage.setItem(
      `streamUrl_${id}`,
      JSON.stringify({
        url: data.streamUrl,
        expires: Date.now() + 5 * 60 * 1000,
      }),
    );

    return data.streamUrl;
  } catch (error) {
    console.error("Error getting stream url:", error);
    throw new Error("Failed to get Url");
  }
}

export async function preloadStreamUrls(channelIds: string[]): Promise<void> {
  console.log(`Preloading stream URLs for ${channelIds.length} channels`);

  const streamPromises = channelIds.map(async (channelId) => {
    try {
      const streamUrl = await getStreamUrl(channelId);
      console.log(`✓ Preloaded stream URL for ${channelId}`);
    } catch (error) {
      console.warn(`✗ Failed to preload stream URL for ${channelId}:`, error);
    }
  });

  await Promise.allSettled(streamPromises);
  console.log("Stream URL preloading completed");
}

export async function fetchFeaturedMatches(): Promise<LiveItem[]> {
  try {
    const res = await fetch(`${API}/streamed/matches`);
    if (!res.ok) throw new Error("Failed to load featured matches");

    const matches: StreamedMatch[] = await res.json();

    const streamPromises = matches.slice(0, 5).map((match) =>
      fetch(`${API}/streamed/m3u8/all?matchId=${match.id}`)
        .then((res) => res.json())
        .catch((error) => {
          console.error(`Error fetching streams for match ${match.id}:`, error);
          return [];
        }),
    );

    const streamResults = await Promise.all(streamPromises);

    const featuredItems: LiveItem[] = matches
      .slice(0, 5)
      .map((match, index) => ({
        id: `streamed_${match.id}`,
        match: `${match.homeTeam} vs ${match.awayTeam}`,
        category: match.league || "Featured Match",
        start: match.time,
        end: new Date(
          new Date(match.time).getTime() + 2 * 60 * 60 * 1000,
        ).toISOString(),
        logo: match.image || "https://via.placeholder.com/150x150?text=Live",
        channels: [
          {
            id: index + 1000,
            name: "Premium Stream",
            streamUrl: `${API}/streamed/stream?matchId=${match.id}`,
          },
        ],
        isFeatured: true,
        source: "streamed",
        streams: streamResults[index] || [],
      }));

    return featuredItems;
  } catch (error) {
    console.error("Error fetching featured matches:", error);
    return [];
  }
}

export async function preloadSessions(channelIds: string[]): Promise<void> {
  console.log(
    `Preloading sessions and streams for ${channelIds.length} channels`,
  );
  await Promise.all([
    preloadStreamUrls(channelIds),
    Promise.allSettled(
      channelIds.map(async (channelId) => {
        try {
          await initializeSession(channelId);
          console.log(`✓ Preloaded session for ${channelId}`);
        } catch (error) {
          console.warn(`✗ Failed to preload session for ${channelId}:`, error);
        }
      }),
    ),
  ]);
  console.log("Session and stream preloading completed");
}

export async function loadCachedStreams(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const streamKeys = keys.filter((key) => key.startsWith("streamUrl_"));
    const streamItems = await AsyncStorage.multiGet(streamKeys);

    for (const [key, value] of streamItems) {
      if (value) {
        const { url, expires } = JSON.parse(value);
        const channelId = key.replace("streamUrl_", "");
        if (expires > Date.now()) {
          streamUrlCache.set(channelId, { url, expires });
          console.log(`Loaded cached stream URL for ${channelId}`);
        } else {
          await AsyncStorage.removeItem(key);
          console.log(`Removed expired stream URL for ${channelId}`);
        }
      }
    }
  } catch (error) {
    console.error("Error loading cached streams:", error);
  }
}

export async function initializeSession(
  channelId: string,
): Promise<StreamResponse> {
  if (sessionInitPromises.has(channelId)) {
    console.log(`Session initialization already in progress for ${channelId}`);
    return sessionInitPromises.get(channelId)!;
  }

  const initPromise = async (): Promise<StreamResponse> => {
    try {
      console.log(`Initializing session for channel: ${channelId}`);

      const res = await fetch(`${API}/gopst/channel/${channelId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.message || `Session initialization failed (${res.status})`,
        );
      }

      const data: StreamResponse = await res.json();
      if (!data.success) {
        throw new Error(data.message || "Session initialization failed");
      }

      // Cache the stream URL
      streamUrlCache.set(channelId, {
        url: data.proxyUrl,
        expires: Date.now() + 5 * 60 * 1000,
      });

      await AsyncStorage.setItem(
        `streamUrl_${channelId}`,
        JSON.stringify({
          url: data.proxyUrl,
          expires: Date.now() + 5 * 60 * 1000,
        }),
      );

      console.log(`Session successfully initialized for ${channelId}`);
      return data;
    } catch (error) {
      console.error(`Failed to initialize session for ${channelId}:`, error);
      throw error;
    } finally {
      sessionInitPromises.delete(channelId);
    }
  };

  const promise = initPromise();
  sessionInitPromises.set(channelId, promise);

  return promise;
}
