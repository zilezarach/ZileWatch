export type RootStackParamList = {
  Home: undefined;
  VideoPlayer: { videoUrl: string };
  Stream: { magnetLink: string; videoTitle: string };
  Movies: {
    Title: string;
    Year: string;
    Genre: string;
    Plot: string;
    Poster: string;
    imdbID: string;
    imdbRating?: string;
    category?: string;
  };
  VideoList: undefined;
  SeriesDetail: { tv_id: number; title: string };
  EpisodeList: {
    tv_id: number;
    season_number: number;
    seasonName: string;
    seriesTitle: string;
  };
};
