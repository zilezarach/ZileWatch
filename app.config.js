import "dotenv/config";

export default {
  expo: {
    name: "ZileWatch",
    slug: "ZileWatch",
    version: "1.0.2",
    orientation: "default",
    icon: "./assets/images/Original.png",
    scheme: "myapp",
    userInterfaceStyle: "automatic",
    splash: {
      image: "./assets/images/Original.png",
      resizeMode: "cover",
      backgroundColor: "#000000"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.zile.zileWatch"
    },
    android: {
      package: "com.zile.zileWatch",
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      permissions: ["INTERNET", "ACCESS_NETWORK_STATE", "READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE"],
      hermesEnabled: true,
      enableProguardInReleaseBuilds: true,
      enableShrinkResourcesInReleaseBuilds: true,
      useLegacyPackaging: false
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png"
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
            kotlinVersion: "2.0.0",
            enableProguardInReleaseBuilds: true,
            usesCleartextTraffic: true,
            enableR8: true,

            extraProguardRules: `
              # Remove all logging in production
              -assumenosideeffects class android.util.Log {
                public static *** d(...);
                public static *** v(...);
                public static *** i(...);
                public static *** w(...);
              }
              
              # Keep app classes
              -keep class com.zile.zileWatch.** { *; }
              
              # Keep JavaScript interface
              -keepclassmembers class * {
                @android.webkit.JavascriptInterface <methods>;
              }
              
              # Optimize aggressively
              -optimizationpasses 5
              -dontusemixedcaseclassnames
              -dontskipnonpubliclibraryclasses
              -dontpreverify
              -verbose
              
              # Remove unused resources
              -dontwarn **
            `
          }
        }
      ]
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      youtubeApiKey: process.env.YOUTUBE_API_KEY,
      API_Backend: process.env.API_KEY || "https://api.0xzile.sbs",
      TMBD_KEY: process.env.TMBD_KEY,
      TMBD_URL: "https://api.themoviedb.org/3",
      zileLive: process.env.zileLive || "https://live-zile.0xzile.sbs",
      extractorUrl: process.env.extractorUrl || "https://extractor.0xzile.sbs",
      eas: {
        projectId: "c15c7750-d9d3-4cd2-b590-244bc514c9f4"
      }
    }
  }
};
