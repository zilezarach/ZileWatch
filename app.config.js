import "dotenv/config";

export default {
  expo: {
    name: "ZileWatch",
    slug: "ZileWatch",
    version: "1.0.0",
    orientation: "default",
    icon: "./assets/images/Original.png",
    scheme: "myapp",
    userInterfaceStyle: "automatic",
    splash: {
      image: "./assets/images/Original.png",
      resizeMode: "cover",
      backgroundColor: "#000000",
    },
    newArchEnabled: false,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.zile.zileWatch",
    },
    android: {
      package: "com.zile.zileWatch",
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      permissions: [
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        "MEDIA_LIBRARY",
        "ACCESS_MEDIA_LOCATION", // New permission for Android 10+
        "READ_MEDIA_VIDEO", // Ensures videos appear in gallery
        "READ_MEDIA_AUDIO",
      ],
      hermesEnabled: true,
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      "react-native-video",
      "expo-screen-orientation",
      "expo-media-library",
      "expo-file-system",
      [
        "expo-build-properties",
        {
          android: {
            kotlinVersion: "1.9.25",
            suppressKotlinVersionCompatibilityCheck: true,
            shrinkResources: true,
            minifyEnabled: true,
            enableSeparateBuildPerCPUArchitecture: true,
            enableProguardInReleaseBuilds: true,
          },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      youtubeApiKey: process.env.YOUTUBE_API_KEY,
      API_Backend: process.env.API_KEY || "https://api.0xzile.sbs",
      TMBD_KEY: process.env.TMBD_KEY || "3d87c19403c5b4902b9617fc74eb3866",
      TMBD_URL: "https://api.themoviedb.org/3",
      zileLive: process.env.zileLive || "https://live-zile.0xzile.sbs/streams",
      EXTRA_URL: process.env.EXTRA_URL || "https://extractor.0xzile.sbs",
      eas: {
        projectId: "c15c7750-d9d3-4cd2-b590-244bc514c9f4",
      },
    },
  },
};
