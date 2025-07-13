import { StreamingLink } from "@/utils/streamingService";

export type RootStackParamList = {
  Home: undefined;
  Search: undefined;
  Settings: undefined;
  MovieDetail: {
    movie_id: string;
    title?: string;
    isFromBackend?: boolean;
    poster: string;
    slug: string;
    stats?: {
      seasons?: string;
      year?: string;
      duration?: string;
      rating?: string;
    };
    useFallback?: boolean;
  };
  SeriesDetail: {
    tv_id: string;
    title?: string;
    slug: string;
    isFromBackend?: boolean;
    poster: string;
    stats?: {
      seasons?: string;
      year?: string;
      duration?: string;
      rating?: string;
    };
    useFallback?: boolean;
    seasonId: string;
  };
  EpisodeList: {
    tv_id: string;
    seasonId: string;
    seasonNumberForApi: string;
    season_number?: number | string;
    seasonName?: string;
    seriesTitle?: string;
    isFromBackend?: boolean;
    slug: string;
    useFallback?: boolean;
    seasonNumber: number;
  };
  Stream: {
    mediaType: "movie" | "tvSeries";
    id: number | string;
    sourceId?: string;
    episodeId?: string;
    useFallback?: boolean;
    seriesId?: number | string;
    videoTitle: string;
    season?: string;
    episode?: string;
    seasonNumber?: string;
    episodeNumber?: string;
    streamUrl?: string;
    slug: string;
    subtitles?: Array<{
      file: string;
      label?: string;
      kind?: string;
    }>;
    availableQualities: StreamingLink[];
    sourceName?: string;
  };
  LivePlayer: {
    title: string;
    url: string;
  };
  Favorites: undefined;
  Profile: undefined;
  Login: undefined;
  Register: undefined;
  VideoPlayer: {
    videoUrl?: string;
  };
  Movies: undefined;
};
