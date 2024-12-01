import React from "react";
import { WebView } from "react-native-webview";
import { View, StyleSheet, Dimensions } from "react-native";
import { useNavigation } from "@react-navigation/native";

const { width } = Dimensions.get("window");

type VideoPlayProps = {
  route: { params: { videoUrl: string } };
};

const videoPlayer: React.FC<VideoPlayProps> = ({ route }) => {
  const { videoUrl } = route.params;

  const videoId = videoUrl.split("v=")[1]?.split("&")[0];

  return (
    <View style={styles.container}>
      <WebView
        source={{
          uri: `https://www.youtube.com/embed/${videoId}`,
        }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  webview: {
    width: "100%",
    height: (width * 9) / 16,
  },
});

export default videoPlayer;
