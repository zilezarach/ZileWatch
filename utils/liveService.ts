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

import Constants from "expo-constants";

const sessionInitPromises = new Map<string, Promise<StreamResponse>>();
const API = Constants?.expoConfig?.extra?.zileLive;

export async function fetchLiveSports(): Promise<LiveItem[]> {
  try {
    // Fetch both featured matches and regular channels concurrently
    const [featuredMatches, regularChannels] = await Promise.allSettled([
      fetchFeaturedMatches(),
      fetchRegularChannels(),
    ]);

    const featured =
      featuredMatches.status === "fulfilled" ? featuredMatches.value : [];
    const regular =
      regularChannels.status === "fulfilled" ? regularChannels.value : [];

    // Combine featured matches at the top, then regular channels
    return [...featured, ...regular];
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

    // Transform predefined channels into LiveItem format
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
      }
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
  } else if (channelName.toLowerCase().includes("espn")) {
    return "ESPN";
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

  // Add "Featured" category if there are featured items
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
    // Put "Featured" first
    if (a === "Featured") return -1;
    if (b === "Featured") return 1;
    return a.localeCompare(b);
  });
}

export async function getStreamUrl(channelId: string): Promise<string> {
  try {
    const res = await fetch(`${API}/gopst/channel/${channelId}`);
    if (!res.ok) throw new Error("Failed to get stream URL");

    const data = await res.json();
    return data.proxyUrl;
  } catch (error) {
    console.error("Error getting stream URL:", error);
    throw new Error("Failed to get stream URL");
  }
}

export async function getChannelsStream(id: string): Promise<string> {
  try {
    console.log("Fetching stream for channel ID:", id); // Debug log
    const res = await fetch(`${API}/streams/channel/${id}`);
    if (!res.ok) {
      console.error("Failed to get stream URL:", res.status, res.statusText);
      throw new Error("Failed to get Stream url");
    }
    const data = await res.json();
    console.log("Stream URL response:", data); // Debug log
    return data.streamUrl;
  } catch (error) {
    console.error("Error getting stream url:", error);
    throw new Error("Failed to get Url");
  }
}
export async function fetchFeaturedMatches(): Promise<LiveItem[]> {
  try {
    const res = await fetch(`${API}/streamed/matches`);
    if (!res.ok) throw new Error("Failed to load featured matches");

    const matches: StreamedMatch[] = await res.json();

    // Transform streamed matches into LiveItem format
    const featuredItems: LiveItem[] = matches
      .slice(0, 5)
      .map((match, index) => ({
        id: `streamed_${match.id}`,
        match: `${match.homeTeam} vs ${match.awayTeam}`,
        category: match.league || "Featured Match",
        start: match.time,
        end: new Date(
          new Date(match.time).getTime() + 2 * 60 * 60 * 1000
        ).toISOString(),
        logo: match.image || "https://via.placeholder.com/150x150?text=Live",
        channels: [
          {
            id: index + 1000, // Use higher IDs to avoid conflicts
            name: "Premium Stream",
            streamUrl: `${API}/streamed/stream?matchId=${match.id}`,
          },
        ],
        isFeatured: true,
        source: "streamed",
      }));

    return featuredItems;
  } catch (error) {
    console.error("Error fetching featured matches:", error);
    return [];
  }
}

export async function preloadSessions(channelIds: string[]): Promise<void> {
  console.log(`Preloading sessions for ${channelIds.length} channels`);

  const initPromises = channelIds.map(async (channelId) => {
    try {
      await initializeSession(channelId);
      console.log(`✓ Preloaded session for ${channelId}`);
    } catch (error) {
      console.warn(`✗ Failed to preload session for ${channelId}:`, error);
    }
  });

  // Wait for all with a timeout
  await Promise.allSettled(initPromises);
  console.log("Session preloading completed");
}

export async function initializeSession(
  channelId: string
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
          errorData.message || `Session initialization failed (${res.status})`
        );
      }

      const data: StreamResponse = await res.json();

      if (!data.success) {
        throw new Error(data.message || "Session initialization failed");
      }

      if (!data.sessionReady) {
        console.warn(
          `Session initialized but not ready for ${channelId}: ${data.message}`
        );
      }

      console.log(`Session successfully initialized for ${channelId}`);
      return data;
    } catch (error) {
      console.error(`Failed to initialize session for ${channelId}:`, error);
      throw error;
    } finally {
      // Clean up the promise cache
      sessionInitPromises.delete(channelId);
    }
  };

  const promise = initPromise();
  sessionInitPromises.set(channelId, promise);

  return promise;
}
