import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";

const Cache_Keys = {
  LAST_CLEAN: "@cache_last_clean",
  CLEAN_INTERVAL: 24 * 60 * 60 * 1000
};

export class CacheManager {
  private static instance: CacheManager;
  private constructor() {}
  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }
  //Check Cache every 24hrs
  async checkCache(): Promise<boolean> {
    try {
      const lastCache = await AsyncStorage.getItem(Cache_Keys.LAST_CLEAN);
      if (!lastCache) return true;
      const timeCleaned = Date.now() - parseInt(lastCache, 10);
      return timeCleaned >= Cache_Keys.CLEAN_INTERVAL;
    } catch (e: any) {
      console.log("Unable to check the cache", e);
      return false;
    }
  }
  //Get the Cache Size before Cleaning
  async getCacheSize(): Promise<number> {
    try {
      const cacheDir = FileSystem.cacheDirectory;
      if (!cacheDir) return 0;
      const files = await FileSystem.readDirectoryAsync(cacheDir);
      let totalFiles = 0;
      for (const file of files) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(`${cacheDir}${file}`);
          if (fileInfo.exists && "size" in fileInfo && !fileInfo.isDirectory) {
            totalFiles += fileInfo.size || 0;
          }
        } catch (e) {}
      }
      return totalFiles;
    } catch (e) {
      console.log("Unable to get Cache Size", e);
      return 0;
    }
  }
  //Clean Image Cache
  async cleanImageCache(): Promise<void> {
    try {
      const imageCachePath = `${FileSystem.cacheDirectory}images/`;
      const imgPathExist = await FileSystem.getInfoAsync(imageCachePath);
      if (imgPathExist.exists) {
        await FileSystem.deleteAsync(imageCachePath, { idempotent: true });
        await FileSystem.makeDirectoryAsync(imageCachePath, { intermediates: true });
        console.log("Image cache cleaned");
      }
    } catch (e) {
      console.log("Unable to Clean Cache on Image", e);
    }
  }
  //Clean Video Cache
  async cleanVideoCache(): Promise<void> {
    try {
      const videoCachePath = `${FileSystem.cacheDirectory}video/`;
      const vidPathExist = await FileSystem.getInfoAsync(videoCachePath);
      if (vidPathExist.exists) {
        await FileSystem.deleteAsync(videoCachePath, { idempotent: true });
        await FileSystem.makeDirectoryAsync(videoCachePath, { intermediates: true });
        console.log("Video Cache Cleaned");
      }
    } catch (e) {
      console.log("Unable to clean Cache on Video", e);
    }
  }
  //Clean Thumbnail Cache
  async cleanThumbnailCache(): Promise<void> {
    try {
      const thumbnailCache = `${FileSystem.cacheDirectory}thumbnails/`;
      const thumbPathExist = await FileSystem.getInfoAsync(thumbnailCache);
      if (thumbPathExist) {
        await FileSystem.deleteAsync(thumbnailCache, { idempotent: true });
        await FileSystem.makeDirectoryAsync(thumbnailCache, { intermediates: true });
        console.log("Thumbnail Cache Cleaned");
      }
    } catch (e) {
      console.log("Unable to Clean Thumbnail Cache", e);
    }
  }
  async performClean(
    options: {
      images?: boolean;
      videos?: boolean;
      thumbnails?: boolean;
    } = {}
  ): Promise<{ success: boolean; savedSpace?: number }> {
    const { images = true, videos = true, thumbnails = true } = options;
    try {
      const sizeBef = await this.getCacheSize();
      console.log(`Starting Cache....`);
      if (images) await this.cleanImageCache();
      if (videos) await this.cleanVideoCache();
      if (thumbnails) await this.cleanThumbnailCache();
      const sizeAft = await this.getCacheSize();
      const savedSpace = sizeBef - sizeAft;
      await AsyncStorage.setItem(Cache_Keys.LAST_CLEAN, Date.now().toString());
      return { success: true, savedSpace };
    } catch (e) {
      console.log("Unable to Perform Full Clean", e);
      return { success: false };
    }
  }
}
