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
  id: number;
  match: string;
  category: string;
  start: string;
  end: string;
  channels: Channel[];
}

const API = process.env.zileLive || "http://localhost:4500/streams";

export async function fetchLiveSports(): Promise<LiveItem[]> {
  const res = await fetch(`${API}/live`);
  if (!res.ok) throw new Error("Failed to load live sports");
  return res.json();
}

export async function fetchChannels(): Promise<TVChannels[]> {
  const res = await fetch(`${API}/channels`);
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
