export type RootStackParamList = {
  Home: undefined;
  VideoPlayer: { videoUrl: string };
  Stream: { magnetLink: string; videoTitle: string };
  Movies: undefined;
  VideoList: undefined;
  SeriesDetail: { tv_id: number; title: string };
  EpisodeList: { tv_id: number; season_number: number; seasonName: string };
};
