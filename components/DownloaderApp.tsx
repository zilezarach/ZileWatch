import React, { useState } from "react";
import { View, TextInput, Button, Alert, StyleSheet } from "react-native";
import ModalPick from "./DownloadPrompt";

const DownloaderApp = () => {
  const [url, setUrl] = useState("");
  const [modalVisible, setModalVisible] = useState(false);

  const handleDownload = async (format: "audio" | "video") => {
    try {
      // Send download request to the backend
      const response = await fetch(
        "https://backendtorrent.onrender.com/downloader",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url,
            format,
          }),
        },
      );

      const data = await response.json();
      if (response.ok) {
        Alert.alert("Success", `Download started: ${data.message}`);
      } else {
        Alert.alert("Error", data.error || "Download failed");
      }
    } catch (error) {
      console.error("Download Error:", error);
      Alert.alert("Error", "An error occurred while downloading the file.");
    } finally {
      setModalVisible(false); // Close the modal after handling
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Enter video URL"
        placeholderTextColor="#999"
        value={url}
        onChangeText={setUrl}
      />
      <Button
        title="Download"
        onPress={() => setModalVisible(true)}
        disabled={!url.trim()}
      />
      <ModalPick
        visable={modalVisible}
        onClose={() => setModalVisible(false)}
        onSelect={handleDownload}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#121212",
  },
  input: {
    width: "100%",
    padding: 12,
    borderRadius: 8,
    borderColor: "#7d0b02",
    borderWidth: 1,
    marginBottom: 16,
    color: "#fff",
  },
});

export default DownloaderApp;
