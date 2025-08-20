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
  match: string;
  category: string;
  start: string;
  logo: string;
  end: string;
  channels: Channel[];
}

import Constants from "expo-constants";
import { channel } from "process";

const API = Constants?.expoConfig?.extra?.zileLive;

export async function fetchLiveSports(): Promise<LiveItem[]> {
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
        };
      }
    );

    return liveItems;
  } catch (error) {
    console.error("Error fetching live sports:", error);
    throw new Error("Failed to load live sports");
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

export async function fetchCategories(): Promise<string[]> {
  const res = await fetch(`${API}/categories`);
  if (!res.ok) throw new Error("Failed to fetch categories");
  const data = await res.json();
  return data.categories;
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
