export type RootStackParamList = {
  Home: undefined;
  VideoPlayer: { videoUrl: string };
  Stream: {
    mediaType: "movie" | "show";
    id: number;
    sourceId: string;
    videoTitle: string;
    season?: string;
    episode?: string;
  };
  Movies: undefined;
  VideoList: undefined;
  SeriesDetail: { tv_id: number; title: string };
  EpisodeList: {
    tv_id: number;
    season_number: number;
    seasonName: string;
    seriesTitle: string;
  };
};
