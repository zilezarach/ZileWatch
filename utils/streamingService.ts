import axios from "axios";
import Constants from "expo-constants";
import {
  Movie,
  Season,
  Episode,
  Server,
  MovieDetailResponse,
  SeasonResponse,
  EpisodeResponse,
  ServerResponse,
  SourcesResponse,
  MovieStreamingInfo,
  EpisodeStreamingInfo,
  SeriesInfo,
  SeasonWithEpisodes,
  BackendEpisode,
} from "../types/models";

const API_BASE_URL =
  Constants.expoConfig?.extra?.API_Backend || "http://localhost:7474";

interface StreamingOptions {
  episodeId?: string;
  serverId?: string;
  quality?: "hd" | "sd";
}

interface EpisodeStreamingOptions extends StreamingOptions {
  seasonId?: string;
  episodeNumber?: string | number;
  episodeId?: string;
}

/**
 * Streaming service to handle all API calls for content streaming
 */
class StreamingService {
  /**
   * Search for content by title
   * @param {string} query - The search query
   * @param {string} type - Content type (movie or series)
   * @returns {Promise<Array>} - List of search results
   */
  async searchContent(query: string, type: string = "movie"): Promise<any[]> {
    try {
      const response = await axios.get(`${API_BASE_URL}/content`, {
        params: { q: query },
      });

      // Filter by type if needed
      let results = response.data.items || [];
      if (type === "series") {
        results = results.filter(
          (item: any) =>
            item.stats?.seasons || item.title.toLowerCase().includes("season")
        );
      } else if (type === "movie") {
        results = results.filter((item: any) => !item.stats?.seasons);
      }

      return results;
    } catch (error) {
      console.error("Search error:", error);
      throw new Error("Failed to search for content");
    }
  }

  /**
   * Get movie details
   * @param {string} movieId - Movie ID
   * @returns {Promise<Object>} - Movie details
   */
  async getMovieDetails(movieId: string): Promise<Movie> {
    try {
      const response = await axios.get<MovieDetailResponse>(
        `${API_BASE_URL}/movie/${movieId}`
      );
      return response.data.detail || (response.data as unknown as Movie);
    } catch (error) {
      console.error("Movie details error:", error);
      throw new Error("Failed to get movie details");
    }
  }

  /**
   * Get seasons for a series
   * @param {string} seriesId - Series ID
   * @returns {Promise<Array>} - List of seasons
   */
  async getSeasons(seriesId: string): Promise<Season[]> {
    try {
      const response = await axios.get<SeasonResponse>(
        `${API_BASE_URL}/movie/${seriesId}/seasons`
      );
      return response.data.seasons || [];
    } catch (error) {
      console.error("Seasons error:", error);
      throw new Error("Failed to get seasons");
    }
  }

  /**
   * Get episodes for a season
   * @param {string} seriesId - Series ID
   * @param {string} seasonId - Season ID
   * @returns {Promise<Array>} - List of episodes
   */
  async getEpisodes(
    seriesId: string,
    seasonId: string
  ): Promise<BackendEpisode[]> {
    try {
      const response = await axios.get<EpisodeResponse>(
        `${API_BASE_URL}/movie/${seriesId}/episodes`,
        {
          params: { seasonId },
        }
      );
      return response.data.episodes || [];
    } catch (error) {
      console.error("Episodes error:", error);
      throw new Error("Failed to get episodes");
    }
  }

  /**
   * Get available servers for a movie/episode
   * @param {string} contentId - Content ID (movie or series)
   * @param {string} episodeId - Episode ID (for series)
   * @returns {Promise<Array>} - List of available servers
   */
  async getServers(contentId: string, episodeId?: string): Promise<Server[]> {
    try {
      const response = await axios.get<ServerResponse>(
        `${API_BASE_URL}/movie/${contentId}/servers`,
        {
          params: episodeId ? { episodeId } : undefined,
        }
      );
      return response.data.servers || [];
    } catch (error) {
      console.error("Servers error:", error);
      throw new Error("Failed to get servers");
    }
  }

  /**
   * Get streaming sources for a movie/episode
   * @param {string} contentId - Content ID
   * @param {string} serverId - Server ID
   * @returns {Promise<Object>} - Streaming sources
   */
  async getSources(
    contentId: string,
    serverId: string
  ): Promise<SourcesResponse> {
    try {
      const response = await axios.get<SourcesResponse>(
        `${API_BASE_URL}/movie/${contentId}/sources`,
        {
          params: { serverId },
        }
      );
      return response.data;
    } catch (error) {
      console.error("Sources error:", error);
      throw new Error("Failed to get sources");
    }
  }

  /**
   * Get complete streaming information for a movie in one call
   * @param {string} movieId - Movie ID
   * @param {Object} options - Options
   * @returns {Promise<Object>} - Complete streaming info
   */
  async getMovieStreamingInfo(
    movieId: string,
    options: StreamingOptions = {}
  ): Promise<MovieStreamingInfo> {
    try {
      // Step 1: Get servers directly
      const servers = await this.getServers(movieId);

      if (!servers || servers.length === 0) {
        throw new Error("No servers available");
      }

      // Step 2: Choose a server (prefer Vidcloud or first available)
      const preferredServer = options.serverId
        ? servers.find((s) => s.id === options.serverId)
        : servers.find((s) => s.name === "Vidcloud") || servers[0];

      if (!preferredServer) {
        throw new Error("No valid server found");
      }

      // Step 3: Get sources from preferred server
      const sources = await this.getSources(movieId, preferredServer.id);

      // Filter by quality if specified
      const qualitySource =
        options.quality && sources.sources
          ? sources.sources.find((s) => s.quality === options.quality)
          : null;

      // Return complete info
      return {
        servers,
        selectedServer: preferredServer,
        sources,
        streamUrl:
          qualitySource?.file ||
          (sources.sources && sources.sources.length > 0
            ? sources.sources[0].file
            : null),
        subtitles: sources.tracks || [],
      };
    } catch (error) {
      console.error("Get movie streaming info error:", error);
      throw new Error(
        `Failed to get streaming info: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get complete streaming information for an episode in one call
   * @param {string} seriesId - Series ID
   * @param {string} episodeId - Episode ID
   * @param {Object} options - Options
   * @returns {Promise<Object>} - Complete streaming info
   */
  async getEpisodeStreamingInfo(
    seriesId: string,
    episodeId: string,
    options: StreamingOptions = {}
  ): Promise<EpisodeStreamingInfo> {
    try {
      // Step 1: Get servers for this episode
      const servers = await this.getServers(seriesId, episodeId);

      if (!servers || servers.length === 0) {
        throw new Error("No servers available for this episode");
      }

      // Step 2: Choose a server (prefer Vidcloud or first available)
      const preferredServer = options.serverId
        ? servers.find((s) => s.id === options.serverId)
        : servers.find((s) => s.name === "Vidcloud") || servers[0];

      if (!preferredServer) {
        throw new Error("No valid server found");
      }

      // Step 3: Get sources from preferred server
      const sources = await this.getSources(seriesId, preferredServer.id);

      // Filter by quality if specified
      const qualitySource =
        options.quality && sources.sources
          ? sources.sources.find((s) => s.quality === options.quality)
          : null;

      // Return complete info
      return {
        servers,
        selectedServer: preferredServer,
        sources,
        streamUrl:
          qualitySource?.file ||
          (sources.sources && sources.sources.length > 0
            ? sources.sources[0].file
            : null),
        subtitles: sources.tracks || [],
      };
    } catch (error) {
      console.error("Get episode streaming info error:", error);
      throw new Error(
        `Failed to get episode streaming info: ${(error as Error).message}`
      );
    }
  }

  /**
   * Complete series helper - gets everything needed for a series
   * @param {string} seriesId - Series ID
   * @returns {Promise<Object>} - Complete series information
   */
  async getSeriesInfo(seriesId: string): Promise<SeriesInfo> {
    try {
      // Get basic series info
      const details = await this.getMovieDetails(seriesId);

      // Get all seasons
      const seasons = await this.getSeasons(seriesId);

      return {
        details,
        seasons,
        title: details.title || "Unknown Series",
      };
    } catch (error) {
      console.error("Get series info error:", error);
      throw new Error(`Failed to get series info: ${(error as Error).message}`);
    }
  }

  /**
   * Get complete season information with episodes
   * @param {string} seriesId - Series ID
   * @param {string} seasonId - Season ID
   * @returns {Promise<Object>} - Complete season with episodes
   */
  async getSeasonWithEpisodes(
    seriesId: string,
    seasonId: string
  ): Promise<SeasonWithEpisodes> {
    try {
      // Get all episodes for this season
      const episodes = await this.getEpisodes(seriesId, seasonId);

      return {
        seasonId,
        episodes,
        episodeCount: episodes.length,
      };
    } catch (error) {
      console.error("Get season episodes error:", error);
      throw new Error(
        `Failed to get season episodes: ${(error as Error).message}`
      );
    }
  }

  /**
   * Setup streaming for a specific episode from scratch with minimal API calls
   * @param {string} seriesId - Series ID
   * @param {Object} options - Options
   * @returns {Promise<Object>} - Complete streaming setup
   */
  async setupEpisodeStreaming(
    seriesId: string,
    options: EpisodeStreamingOptions = {}
  ): Promise<EpisodeStreamingInfo> {
    try {
      const { seasonId, episodeNumber, episodeId: providedEpisodeId } = options;
      let episodeId = providedEpisodeId;

      // If we don't have an episodeId but have seasonId and episodeNumber, get the episodeId
      if (!episodeId && seasonId && episodeNumber) {
        const episodes = await this.getEpisodes(seriesId, seasonId);
        const episode = episodes.find(
          (ep) =>
            ep.episode_number ===
            (typeof episodeNumber === "string"
              ? parseInt(episodeNumber)
              : episodeNumber)
        );

        if (!episode) {
          throw new Error(`Episode ${episodeNumber} not found in season`);
        }

        episodeId = episode.id.toString();
      }

      if (!episodeId) {
        throw new Error("No episode ID provided or found");
      }

      // Get streaming info for this episode
      return await this.getEpisodeStreamingInfo(seriesId, episodeId, options);
    } catch (error) {
      console.error("Setup episode streaming error:", error);
      throw new Error(
        `Failed to setup episode streaming: ${(error as Error).message}`
      );
    }
  }

  /**
   * General streaming info getter that handles both movies and episodes
   * @param {string} contentId - Content ID (movie or series)
   * @param {Object} options - Options including episodeId for series
   * @returns {Promise<Object>} - Complete streaming info
   */
  async getStreamingInfo(
    contentId: string,
    options: StreamingOptions = {}
  ): Promise<MovieStreamingInfo | EpisodeStreamingInfo> {
    try {
      // Determine if this is a movie or an episode based on presence of episodeId
      if (options.episodeId) {
        // This is an episode
        return await this.getEpisodeStreamingInfo(
          contentId,
          options.episodeId,
          options
        );
      } else {
        // This is a movie
        return await this.getMovieStreamingInfo(contentId, options);
      }
    } catch (error) {
      console.error("Get streaming info error:", error);
      throw new Error(
        `Failed to get streaming info: ${(error as Error).message}`
      );
    }
  }
}

// Create singleton instance
const streamingService = new StreamingService();
export default streamingService;
