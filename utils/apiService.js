import axios from "axios";

const YOUTUBE_API = process.env.YOUTUBE_API_KEY;
const YOUTUBE_URL = "https://youtube.googleapis.com/youtube/v3/videos";

export const fetchPopularVids = async () => {
  try {
    const response = await axios.get(YOUTUBE_URL, {
      params: {
        part: "snippet,contentDetails,statistics",
        chart: "mostPopular",
        regionCode: "KE",
        maxresults: 10,
        key: YOUTUBE_API
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
    console.log("Error Fetching Videos", error);
    throw error;
  }
};
