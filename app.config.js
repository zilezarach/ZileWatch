import "dotenv/config";

export default {
  expo: {
    name: "ZileWatch",
    slug: "ZileWatch",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/Original.png",
    scheme: "myapp",
    userInterfaceStyle: "automatic",
    splash: {
      image: "./assets/images/splash.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    newArchEnabled: true,
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
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: ["expo-router", "react-native-video"],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      youtubeApiKey: process.env.YOUTUBE_API_KEY,
    },
  },
};
