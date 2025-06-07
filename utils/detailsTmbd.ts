import axios from "axios";
import Constants from "expo-constants";

const TMBD_KEY = Constants.expoConfig?.extra?.TMBD_KEY;
const TMBD_BASE_URL = "https://api.themoviedb.org/3";

function buildImageUrl(path: string, size: string = "w500") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : "";
}

function createSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/[\s_-]+/g, "-") // Replace spaces/underscores with hyphens
    .replace(/^-+|-+$/g, ""); // Trim hyphens from start/end
}

if (!TMBD_KEY) {
  console.warn(
    "[detailsTmbd] no TMDB_KEY found in Constants.expoConfig.extra.TMDB_KEY"
  );
}

export interface RawTmbdMovie {
  id: number;
  title: string;
  overview: string;
  name: string;
  poster_path: string;
  poster: string;
  release_date: string;
  vote_average: number;
}

export interface RawTmbdTv {
  id: number;
  title: string;
  overview: string;
  name: string;
  poster_path: string;
  poster: string;
  first_air_date: string;
  vote_average: number;
}

export interface SearchItem {
  id: string;
  title: string;
  poster: string;
  stats: {
    year?: string;
    duration?: string;
    rating?: string;
    seasons?: string;
  };
  type: "movie" | "tvSeries";
  slug: string;
}

export interface HomeData {
  spotlight: Array<{
    id: string;
    title: string;
    banner: string;
    poster: string;
    rating: string;
    year: string;
  }>;
  trending: {
    movies: SearchItem[];
    tvSeries: SearchItem[];
  };
  latestMovies: SearchItem[];
  latestTvSeries: SearchItem[];
}

async function getTrendingMovies(): Promise<RawTmbdMovie[]> {
  const resp = await axios.get(`${TMBD_BASE_URL}/trending/movie/week`, {
    params: { api_key: TMBD_KEY },
  });
  return resp.data.results;
}

async function getTrendingTV(): Promise<RawTmbdTv[]> {
  const resp = await axios.get(`${TMBD_BASE_URL}/trending/tv/week`, {
    params: { api_key: TMBD_KEY },
  });
  return resp.data.results;
}

async function getNowPlayingMovies(): Promise<RawTmbdMovie[]> {
  const resp = await axios.get(`${TMBD_BASE_URL}/movie/now_playing`, {
    params: { api_key: TMBD_KEY, language: "en-US" },
  });
  return resp.data.results;
}

async function getOnTheAirTV(): Promise<RawTmbdTv[]> {
  const resp = await axios.get(`${TMBD_BASE_URL}/tv/on_the_air`, {
    params: { api_key: TMBD_KEY, language: "en-US" },
  });
  return resp.data.results;
}

function transformMovieToSearchItem(movie: RawTmbdMovie): SearchItem {
  return {
    id: movie.id.toString(),
    title: movie.title,
    poster: buildImageUrl(movie.poster_path, "w500"),
    stats: {
      rating: movie.vote_average.toString(),
      year: movie.release_date ? movie.release_date.split("-")[0] : "",
    },
    type: "movie",
    slug: createSlug(movie.title),
  };
}

function transformTVToSearchItem(tv: RawTmbdTv): SearchItem {
  return {
    id: tv.id.toString(),
    title: tv.name,
    poster: buildImageUrl(tv.poster_path, "w500"),
    stats: {
      rating: tv.vote_average.toString(),
      year: tv.first_air_date ? tv.first_air_date.split("-")[0] : "",
    },
    type: "tvSeries",
    slug: createSlug(tv.name),
  };
}

export async function giveDataToHome(): Promise<HomeData> {
  try {
    const [trendingMovies, trendingTV, nowPlayingMovies, onTheAirTV] =
      await Promise.all([
        getTrendingMovies(),
        getTrendingTV(),
        getNowPlayingMovies(),
        getOnTheAirTV(),
      ]);

    const spotlight = trendingMovies.slice(0, 5).map((movie: any) => ({
      id: movie.id.toString(),
      title: movie.title,
      banner:
        buildImageUrl(movie.backdrop_path, "original") ||
        buildImageUrl(movie.poster_path, "w500"),
      poster: buildImageUrl(movie.poster_path, "w500"),
      rating: movie.vote_average.toString(),
      year: movie.release_date ? movie.release_date.split("-")[0] : "",
    }));

    return {
      spotlight,
      trending: {
        movies: trendingMovies.map(transformMovieToSearchItem),
        tvSeries: trendingTV.map(transformTVToSearchItem),
      },
      latestMovies: nowPlayingMovies
        .slice(0, 5)
        .map(transformMovieToSearchItem),
      latestTvSeries: onTheAirTV.slice(0, 5).map(transformTVToSearchItem),
    };
  } catch (error: any) {
    console.error("Error fetching home data from TMDB:", error.message);
    throw new Error("Failed to fetch home data from TMDB");
  }
}

export default {
  giveDataToHome,
};
