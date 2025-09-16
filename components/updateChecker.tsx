import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Button,
  Alert,
  ActivityIndicator,
  Modal,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
// REPLACED: DeviceInfo with Expo alternatives
import * as Application from "expo-application";
import * as Device from "expo-device";
import * as FileSystem from "expo-file-system";
import * as Linking from "expo-linking";
import SHA256 from "crypto-js/sha256";
import Base64 from "crypto-js/enc-base64";
import Constants from "expo-constants";

const URL = Constants.expoConfig?.extra?.API_Backend;

const UPDATE_URL = `${URL}/update/check`;

interface Update {
  version: string;
  changelog: string;
  fileName: string;
  downloadUrl: string;
  sha256: string;
}

export default function UpdateManager() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    checkForUpdates();
  }, []);

  async function checkForUpdates() {
    try {
      const res = await fetch(UPDATE_URL);
      const data: Update = await res.json();

      // REPLACED: DeviceInfo.getVersion() with Application.nativeApplicationVersion
      const currentVersion = Application.nativeApplicationVersion;

      if (data.version !== currentVersion) {
        setUpdate(data);
        setModalVisible(true); // Show modal when update is available
      }
    } catch (err) {
      console.log("Update check failed:", err);
    }
  }

  async function downloadAndInstall() {
    if (!update) return;
    setLoading(true);

    try {
      const fileUri = `${FileSystem.cacheDirectory}${update.fileName}`;
      const downloadRes = await FileSystem.downloadAsync(
        update.downloadUrl,
        fileUri,
      );

      // SHA256 verification
      const fileData = await FileSystem.readAsStringAsync(downloadRes.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const localHash = SHA256(Base64.parse(fileData)).toString();

      if (localHash !== update.sha256)
        throw new Error("File integrity check failed!");

      setLoading(false);
      Alert.alert("Update ready", "Opening installer...");
      await Linking.openURL(downloadRes.uri);
    } catch (err: any) {
      setLoading(false);
      Alert.alert("Update failed", err.message);
    }
  }

  // Additional device info logging for debugging (optional)
  useEffect(() => {
    if (__DEV__) {
      console.log("Device Info:", {
        brand: Device.brand,
        modelName: Device.modelName,
        osName: Device.osName,
        osVersion: Device.osVersion,
        appVersion: Application.nativeApplicationVersion,
        buildVersion: Application.nativeBuildVersion,
      });
    }
  }, []);

  if (!update) return null;

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setModalVisible(false)}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>🚀 Update Available!</Text>
          <Text style={styles.version}>v{update.version}</Text>
          <Text style={styles.currentVersion}>
            Current: v{Application.nativeApplicationVersion}
          </Text>
          <Text style={styles.changelog}>{update.changelog}</Text>

          {loading ? (
            <ActivityIndicator
              size="large"
              color="#7d0b02"
              style={{ marginTop: 20 }}
            />
          ) : (
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.buttonUpdate}
                onPress={downloadAndInstall}
              >
                <Text style={styles.buttonText}>Update</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.buttonSkip}
                onPress={() => setModalVisible(false)}
              >
                <Text style={[styles.buttonText, { color: "#7d0b02" }]}>
                  Skip
                </Text>
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
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  modal: {
    width: "85%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  version: {
    fontSize: 18,
    fontWeight: "600",
    color: "#7d0b02",
    marginBottom: 4,
  },
  currentVersion: {
    fontSize: 14,
    color: "#666",
    marginBottom: 12,
  },
  changelog: {
    fontSize: 14,
    color: "#333",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  buttonUpdate: {
    flex: 1,
    backgroundColor: "#7d0b02",
    padding: 12,
    borderRadius: 8,
    marginRight: 10,
    alignItems: "center",
  },
  buttonSkip: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#7d0b02",
    alignItems: "center",
  },
  buttonText: {
    fontWeight: "700",
    color: "#fff",
    fontSize: 16,
  },
});
