// types/models.ts

// Movie/Show models
export interface Movie {
  id: string | number;
  title: string;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  vote_average?: number;
  originalId?: string;
  // Add other movie properties as needed
}

export interface Season {
  id: string | number;
  name: string;
  season_number: number;
  poster_path?: string;
  overview?: string;
  episode_count?: number;
  // Add other season properties as needed
}

export interface Episode {
  id: string | number;
  name: string;
  overview?: string;
  still_path?: string;
  episode_number: number;
  season_number?: number;
  air_date?: string;
  vote_average?: number;
  // Add other episode properties as needed
}

export interface Server {
  id: string;
  name: string;
  // Add other server properties as needed
}

export interface StreamSource {
  file: string;
  quality?: "hd" | "sd";
  type?: string;
}

export interface Subtitle {
  file: string;
  label?: string;
  kind?: string;
}

// API responses
export interface MovieDetailResponse {
  detail: Movie;
  seasons?: Season[];
  // Add other response properties as needed
}

export interface SeasonResponse {
  seasons: Season[];
  // Add other response properties as needed
}

export interface EpisodeResponse {
  episodes: BackendEpisode[];
  // Add other response properties as needed
}

export interface ServerResponse {
  servers: Server[];
  // Add other response properties as needed
}

export interface SourcesResponse {
  sources: StreamSource[];
  tracks?: Subtitle[];
  headers?: Record<string, string>;
  // Add other response properties as needed
}

// Streaming info models
export interface MovieStreamingInfo {
  servers: Server[];
  selectedServer: Server;
  sources: SourcesResponse;
  streamUrl: string | null;
  subtitles: Subtitle[];
}

export interface EpisodeStreamingInfo {
  servers: Server[];
  selectedServer: Server;
  sources: SourcesResponse;
  streamUrl: string | null;
  subtitles: Subtitle[];
}

export interface SeriesInfo {
  details: Movie;
  seasons: Season[];
  title: string;
}

export interface SeasonWithEpisodes {
  seasonId: string;
  episodes: BackendEpisode[];
  episodeCount: number;
}

export interface BackendEpisode {
  id: number;
  title: string;
  number: number;
  description: string;
  episode_number?: number;
  img: string | null;
  still_path: string | null;
}
