export const SOURCES = [
  {
    id: "vidsrc.pro",
    name: "VidSrc.pro",
    movieUrl: "https://vidsrc.xyz/embed/movie/{id}",
    tvUrl: "https://vidsrc.xyz/embed/tv/{id}/{season}/{episode}",
    rank: 36
  },
  {
    id: "superembed",
    name: "Super Embed",
    movieUrl: "https://multiembed.mov/?tmdb=1&video_id={id}",
    tvUrl: "https://multiembed.mov/?tmdb=1&video_id={id}&s={season}&e={episode}",
    rank: 8
  },
  {
    id: "vidsrc.dev",
    name: "Vid Binge",
    movieUrl: "https://vidsrc.dev/embed/movie/{id}",
    tvUrl: "https://vidsrc.dev/embed/tv/{id}/{season}/{episode}",
    rank: 6
  },
  {
    id: "vidsrc.to",
    name: "VidSrc.to",
    movieUrl: "https://vidsrc.to/embed/movie/{id}",
    tvUrl: "https://vidsrc.to/embed/tv/{id}/{season}/{episode}",
    rank: 11
  },
  {
    id: "vidsrc.cc",
    name: "VidSrc.cc",
    movieUrl: "https://vidsrc.cc/v2/embed/movie/{id}",
    tvUrl: "https://vidsrc.cc/v2/embed/tv/{id}/{season}/{episode}",
    rank: 10
  },
  {
    id: "111movies",
    name: "111 Movies",
    tvUrl: "https://111movies.com/tv/{id}/{season}/{episode}",
    movieUrl: "https://111movies.com/movie/{id}",
    rank: 0
  },
  {
    id: "spencerdevs",
    name: "Spencer",
    tvUrl: "https://embed.spencerdevs.xyz/api/embed/tv2/?id={id}&s={id}&e={id}",
    movieUrl: "https://embed.spencerdevs.xyz/api/embed/movie2/?id={id}",
    rank: 0
  }

  // ... add more sources as needed
].sort((a, b) => b.rank - a.rank);

export const DEFAULT_SOURCE = SOURCES[0];

export function getSource(sourceId) {
  if (!sourceId) return DEFAULT_SOURCE;
  return SOURCES.find(source => source.id === sourceId) || DEFAULT_SOURCE;
}

export function getMovieUrl(sourceId, id) {
  const source = getSource(sourceId);
  return source.movieUrl.replace("{id}", id.toString());
}

export function getTvUrl(sourceId, id, season, episode) {
  const source = getSource(sourceId);
  return source.tvUrl
    .replace("{id}", id.toString())
    .replace("{season}", season.toString())
    .replace("{episode}", episode.toString());
}
