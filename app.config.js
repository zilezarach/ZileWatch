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
      image: "./assets/images/Original.png",
      resizeMode: "cover",
      backgroundColor: "#000000"
    },
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.zile.zileWatch"
    },
    android: {
      package: "com.zile.zileWatch",
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#ffffff"
      }
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png"
    },
    plugins: ["expo-router", "react-native-video", "expo-screen-orientation"],
    experiments: {
      typedRoutes: true
    },
    extra: {
      youtubeApiKey: process.env.YOUTUBE_API_KEY,
      API_Backend: process.env.API_KEY || "https://api.0xzile.sbs",
      TMBD_KEY: process.env.TMBD_KEY,
      eas: {
        projectId: "c15c7750-d9d3-4cd2-b590-244bc514c9f4"
      }
    }
  }
};
