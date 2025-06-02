import axios from "axios";
import Constants from "expo-constants";

const BACKEND_API_URL = Constants.expoConfig?.extra?.API_Backend;

export interface SeriesDetails {
  title: string;
  description: string;
  type: "tvSeries";
  stats: Array<{ name: string; value: string | string[] }>;
  poster?: string;
  related?: Array<{
    id: string;
    title: string;
    poster: string;
    stats: {
      seasons?: string;
      rating?: string;
      year?: string;
      duration?: string;
    };
  }>;
  number_of_seasons?: number;
  number_of_episodes?: number;
  seasons: Array<{
    id: string;
    number: number;
    season_number: number;
    name: string;
    episode_count: number;
    poster: string;
    year: string;
  }>;
}

export interface MovieDetails {
  title: string;
  description: string;
  type: "movie";
  stats: Array<{ name: string; value: string | string[] }>;
  poster?: string;
  related?: Array<{
    id: string;
    title: string;
    poster: string;
    stats: {
      seasons?: string;
      rating?: string;
      year?: string;
      duration?: string;
    };
  }>;
}

export async function getMovieDetails(id: string): Promise<MovieDetails> {
  try {
    const response = await axios.get(`${BACKEND_API_URL}/details/${id}`, {
      params: { type: "movie" },
    });

    if (response.data && response.data.success) {
      const data = response.data.data;
      return {
        title: data.title,
        description: data.overview,
        type: "movie",
        stats: [
          {
            name: "Rating",
            value: data.vote_average ? data.vote_average.toString() : "N/A",
          },
          {
            name: "Runtime",
            value: data.runtime ? `${data.runtime} min` : "N/A",
          },
          {
            name: "Year",
            value:
              data.release_date && data.release_date.includes("-")
                ? data.release_date.split("-")[0]
                : "N/A",
          },
          {
            name: "Genres",
            value: data.genres
              ? data.genres.map((g: any) => g.name).join(", ")
              : "N/A",
          },
        ],
        poster: data.poster_path,
        related: [], // You can populate this from recommendations if needed
      };
    } else {
      throw new Error("Backend did not return success");
    }
  } catch (error: any) {
    console.error("Error in getMovieDetails:", error.message);
    throw new Error(error.message || "Error fetching movie details");
  }
}

export async function getSeriesDetailsFallback(
  id: string
): Promise<SeriesDetails> {
  try {
    const response = await axios.get(`${BACKEND_API_URL}/details/${id}`, {
      params: { type: "tv" },
    });

    if (response.data && response.data.success) {
      const data = response.data.data;

      // Build stats array
      const stats = [
        {
          name: "Rating",
          value: data.vote_average ? data.vote_average.toString() : "N/A",
        },
        {
          name: "Year",
          value:
            data.first_air_date && data.first_air_date.includes("-")
              ? data.first_air_date.split("-")[0]
              : "N/A",
        },
      ];

      // Add seasons and episodes count if available
      if (data.number_of_seasons) {
        stats.push({
          name: "Seasons",
          value: data.number_of_seasons.toString(),
        });
      }

      if (data.number_of_episodes) {
        stats.push({
          name: "Episodes",
          value: data.number_of_episodes.toString(),
        });
      }

      // Add genres if available
      if (data.genres && data.genres.length > 0) {
        stats.push({
          name: "Genres",
          value: data.genres.map((g: any) => g.name).join(", "),
        });
      }

      return {
        title: data.title || data.name,
        description: data.overview,
        type: "tvSeries",
        stats,
        poster: data.poster_path,
        related: [],
        number_of_seasons: data.number_of_seasons,
        number_of_episodes: data.number_of_episodes,
        seasons: (data.seasons || [])
          .filter((season: any) => season.season_number > 0)
          .map((season: any) => ({
            id: season.season_number.toString(),
            number: season.season_number,
            season_number: season.season_number, // Keep this for consistency
            name: season.name || `Season ${season.season_number}`,
            episode_count: season.episode_count || 0,
            poster: season.poster_path
              ? `https://image.tmdb.org/t/p/w500${season.poster_path}`
              : season.poster || "",
            year:
              season.year ||
              (season.air_date ? season.air_date.split("-")[0] : ""),
          })),
      };
    } else {
      throw new Error("Backend returned an unsuccessful response for series.");
    }
  } catch (error: any) {
    console.error("Error in getSeriesDetailsFallback:", error.message);
    throw new Error(
      error.message || "Error fetching TV series details from fallback"
    );
  }
}

export default {
  getMovieDetails,
  getSeriesDetailsFallback,
};
