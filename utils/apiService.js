import axios from "axios";
import Constants from "expo-constants";
// Ensure your environment variable is correctly loaded
const YOUTUBE_API = Constants.expoConfig.extra.youtubeApiKey;
const YOUTUBE_URL = "https://youtube.googleapis.com/youtube/v3/videos";

export const fetchPopularVids = async () => {
  try {
    const response = await axios.get(YOUTUBE_URL, {
      params: {
        part: "snippet,contentDetails,statistics",
        chart: "mostPopular",
        regionCode: "US",
        maxResults: 10,
        key: YOUTUBE_API // Pass API Key here
      }
    });

    const videos = response.data.items.map(item => ({
      id: item.id,
      title: item.snippet?.title,
      thumbnails: item.snippet?.thumbnails || {
        medium: { url: "https://via.placeholder.com/150" }
      },
      channelTitle: item.snippet?.channelTitle
    }));
    return videos;
  } catch (error) {
    console.error("Error Fetching Videos:", error.response?.data || error.message);
    throw error;
  }
};

export const fetchYouTubeSearchResults = async query => {
  try {
    const response = await axios.get(`https://www.googleapis.com/youtube/v3/search`, {
      params: {
        part: "snippet",
        q: query,
        type: "video",
        key: YOUTUBE_API,
        maxResults: 10
      }
    });

    // Check if the response contains items
    if (!response.data.items) {
      console.warn("No items found in YouTube API response");
      return [];
    }

    // Map the results to the expected format
    const videos = response.data.items.map(item => {
      if (!item.id?.videoId || !item.snippet) {
        console.warn("Skipping item due to missing videoId or snippet:", item);
        return null;
      }

      return {
        id: item.id.videoId,
        title: item.snippet.title || "Untitled",
        description: item.snippet.description || "No description available.",
        thumbnails: {
          medium: {
            url: item.snippet.thumbnails?.medium?.url || "https://via.placeholder.com/150"
          }
        },
        channelTitle: item.snippet.channelTitle || "Unknown Channel"
      };
    });

    // Filter out null results from skipped items
    return videos.filter(video => video !== null);
  } catch (error) {
    console.error("Error fetching YouTube search results:", error.response?.data || error.message);
    throw error;
  }
};
