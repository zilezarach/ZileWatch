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
    seasonId: string;
  };
  EpisodeList: {
    tv_id: string;
    seasonId: string;
    season_number?: number | string;
    seasonName?: string;
    seriesTitle?: string;
    isFromBackend?: boolean;
    slug: string;
  };
  Stream: {
    mediaType: "movie" | "tvSeries";
    id: number | string;
    sourceId?: string;
    episodeId?: string;
    videoTitle: string;
    season?: string;
    episode?: string;
    streamUrl?: string;
    slug: string;
    subtitles?: Array<{
      file: string;
      label?: string;
      kind?: string;
    }>;
    sourceName?: string;
  };
  Favorites: undefined;
  Profile: undefined;
  Login: undefined;
  Register: undefined;
  VideoPlayer: {
    videoUrl?: string;
  };
  Movies: undefined;
  // Add more routes as needed
};
