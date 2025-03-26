import axios from "axios";
import Constants from "expo-constants";

//BackendAPI
const BACKEND_URL = Constants.expoConfig?.extra?.API_Backend;

//avoid network constrants
let cacheSources = null;

//default source to used
let defaultSource = null;

export async function fetchSources() {
  try {
    const response = await axios.get(`${BACKEND_URL}/sources`);
    const { sources, embeds } = response.data;

    //Combine sources and embeds
    const combinedSources = sources
      .map((source) => ({
        id: source.id,
        name: source.name,
        type: source.type,
        MediaTypes: source.mediaTypes || [],
        rank: source.rank || 0,
      }))
      .sort((a, b) => b.rank - a.rank);
    defaultSource = combinedSources[0] || null;
    cacheSources = combinedSources;
    return combinedSources;
  } catch (error) {
    console.log("Unable to Fetch Sources");
    return [];
  }
}

export async function getSources() {
  if (cacheSources) return cacheSources;
  {
    return fetchSources();
  }
}

export async function getDefaultSource() {
  return defaultSource;
}

export async function getSourcesforMedia(mediaType) {
  try {
    const response = await axios.get(`${BACKEND_URL}/sources-for-media`, {
      params: { mediaType },
    });
    return response.data.sources;
  } catch (error) {
    console.log("Unable to Find Sources related to the mediaType");
  }
}
