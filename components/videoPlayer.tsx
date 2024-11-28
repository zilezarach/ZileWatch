import React from "react";
import Video from "react-native-video";
import { View, StyleSheet, Dimensions } from "react-native";


const { width } = Dimensions.get('window');

type VideoPlayProps = {
  route: { params: { videoUrl: string } };
};

const videoPlayer: React.FC<VideoPlayProps> = ({ route }) => {
  const { videoUrl } = route.params;
  return (
    <View style={styles.container}>
      <Video
        source={{ uri: videoUrl }}
        controls={true}
        resizeMode="contain"
        style={styles.video}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000'
  },
  video: {
    width: '100%',
    height: (width * 9) / 16
  }
});

export default videoPlayer;
