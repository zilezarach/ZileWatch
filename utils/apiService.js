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
        regionCode: "KE",
        maxResults: 10,
        key: YOUTUBE_API // Pass API Key here
      }
    });

    const videos = response.data.items.map(item => ({
      id: item.id,
      snippet: {
        title: item.snippet.title,
        thumbnails: {
          medium: {
            url: item.snippet.thumbnails.medium.url
          }
        }
      }
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
    const videos = response.data.items.map(item => ({
      id: item.id.videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      thumbnails: {
        medium: {
          url: item.snippet.thumbnails.medium.url
        }
      },
      channelTitle: item.snippet.channelTitle
    }));
    return videos;
  } catch (error) {
    console.error("Error fetching YouTube search results:", error.response?.data || error.message);
    throw error;
  }
};
