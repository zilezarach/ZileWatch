import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  Alert,
  ActivityIndicator,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from "react-native";
import * as Application from "expo-application";
import * as Device from "expo-device";
import * as FileSystem from "expo-file-system";
import * as IntentLauncher from "expo-intent-launcher";
import Constants from "expo-constants";

const URL = Constants.expoConfig?.extra?.API_Backend;
const UPDATE_URL = `${URL}/update/check`;

interface Update {
  version: string;
  changelog: string;
  fileName: string;
  downloadUrl: string;
  sha256?: string;
}

export default function UpdateManager() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const downloadResumable = useRef<FileSystem.DownloadResumable | null>(null);

  useEffect(() => {
    checkForUpdates();
  }, []);

  async function checkForUpdates() {
    try {
      const res = await fetch(UPDATE_URL);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data: Update = await res.json();
      const currentVersion = Application.nativeApplicationVersion ?? "0.0.0";

      if (isNewerVersion(data.version, currentVersion)) {
        setUpdate(data);
        setModalVisible(true);
      }
    } catch (err) {
      console.log("Update check failed:", err);
    }
  }

  // Proper semver comparison instead of strict equality
  function isNewerVersion(remote: string, current: string): boolean {
    const parse = (v: string) => v.split(".").map(Number);
    const [rMaj, rMin, rPat] = parse(remote);
    const [cMaj, cMin, cPat] = parse(current);
    if (rMaj !== cMaj) return rMaj > cMaj;
    if (rMin !== cMin) return rMin > cMin;
    return rPat > cPat;
  }

  async function downloadAndInstall() {
    if (!update) return;

    // Android only — iOS handles updates via App Store
    if (Platform.OS !== "android") {
      Alert.alert("Update", "Please update via the App Store.");
      return;
    }

    setDownloading(true);
    setDownloadProgress(0);

    const fileUri = `${FileSystem.cacheDirectory}${update.fileName}`;

    try {
      // Remove any previous download of same file
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (fileInfo.exists) await FileSystem.deleteAsync(fileUri);

      // Download with progress tracking
      downloadResumable.current = FileSystem.createDownloadResumable(
        update.downloadUrl,
        fileUri,
        {},
        (progress) => {
          const pct =
            progress.totalBytesExpectedToWrite > 0
              ? Math.round(
                  (progress.totalBytesWritten /
                    progress.totalBytesExpectedToWrite) *
                    100,
                )
              : 0;
          setDownloadProgress(pct);
        },
      );

      const result = await downloadResumable.current.downloadAsync();
      if (!result?.uri) throw new Error("Download failed — no file URI");

      // Verify file actually exists and has size
      const info = await FileSystem.getInfoAsync(result.uri);
      if (!info.exists || info.size === 0) {
        throw new Error("Downloaded file is empty or missing");
      }

      setDownloading(false);
      setModalVisible(false);

      // Get content URI for Android package installer
      const contentUri = await FileSystem.getContentUriAsync(result.uri);

      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        type: "application/vnd.android.package-archive",
      });
    } catch (err: any) {
      setDownloading(false);
      console.error("Update install error:", err);
      Alert.alert(
        "Update Failed",
        err.message || "Could not download or install update.",
        [
          { text: "Retry", onPress: downloadAndInstall },
          { text: "Cancel", style: "cancel" },
        ],
      );
    }
  }

  function cancelDownload() {
    downloadResumable.current?.pauseAsync().catch(() => {});
    setDownloading(false);
    setDownloadProgress(0);
  }

  if (!update || !modalVisible) return null;

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => !downloading && setModalVisible(false)}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>🚀 Update Available</Text>
          <Text style={styles.version}>v{update.version}</Text>
          <Text style={styles.currentVersion}>
            Current: v{Application.nativeApplicationVersion}
          </Text>

          <View style={styles.changelogBox}>
            <Text style={styles.changelogTitle}>What's new</Text>
            <Text style={styles.changelog}>{update.changelog}</Text>
          </View>

          {downloading ? (
            <View style={styles.progressContainer}>
              <ActivityIndicator size="large" color="#7d0b02" />
              <Text style={styles.progressText}>
                Downloading... {downloadProgress}%
              </Text>
              {/* Progress bar */}
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${downloadProgress}%` },
                  ]}
                />
              </View>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={cancelDownload}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.buttonUpdate}
                onPress={downloadAndInstall}
              >
                <Text style={styles.buttonTextWhite}>Update Now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.buttonSkip}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.buttonTextRed}>Later</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
  },
  modal: {
    width: "88%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 6,
    textAlign: "center",
    color: "#111",
  },
  version: {
    fontSize: 18,
    fontWeight: "700",
    color: "#7d0b02",
    marginBottom: 2,
  },
  currentVersion: {
    fontSize: 13,
    color: "#999",
    marginBottom: 16,
  },
  changelogBox: {
    width: "100%",
    backgroundColor: "#fef2f2",
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    borderLeftWidth: 3,
    borderLeftColor: "#7d0b02",
  },
  changelogTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#7d0b02",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  changelog: {
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
  },
  progressContainer: {
    width: "100%",
    alignItems: "center",
    gap: 10,
  },
  progressText: {
    fontSize: 14,
    color: "#555",
    fontWeight: "600",
  },
  progressBarBg: {
    width: "100%",
    height: 8,
    backgroundColor: "#eee",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#7d0b02",
    borderRadius: 4,
  },
  cancelButton: {
    marginTop: 4,
    padding: 8,
  },
  cancelText: {
    color: "#999",
    fontSize: 13,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    gap: 10,
  },
  buttonUpdate: {
    flex: 1,
    backgroundColor: "#7d0b02",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonSkip: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#7d0b02",
    alignItems: "center",
  },
  buttonTextWhite: { fontWeight: "700", color: "#fff", fontSize: 15 },
  buttonTextRed: { fontWeight: "700", color: "#7d0b02", fontSize: 15 },
});
