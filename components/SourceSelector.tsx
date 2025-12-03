import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { FontAwesome5 } from "@expo/vector-icons";
import { Source, getPrefferedSource, setPrefferedSource } from "../utils/liveService";

interface SourceSelectorProps {
  onSourceChange: (source: Source) => void;
}

export default function SourceSelector({ onSourceChange }: SourceSelectorProps) {
  const [selectedSource, setSelectedSource] = useState<Source>("live-ru");
  useEffect(() => {
    getPrefferedSource().then(setSelectedSource);
  }, []);

  const handleSourceChange = async (source: Source) => {
    setSelectedSource(source);
    await setPrefferedSource(source);
    onSourceChange(source);
  };

  const sources: Array<{
    id: Source;
    label: string;
    icon: string;
    color: string;
  }> = [
    { id: "crichd", label: "CricHD", icon: "broadcast-tower", color: "#4CAF50" },
    { id: "live-ru", label: "LiveRu", icon: "satellite-dish", color: "#FF6B35" },
    { id: "streamed", label: "Streamed", icon: "play-circle", color: "#00008b" }
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Stream Source</Text>
      <View style={styles.sourceContainer}>
        {sources.map(source => (
          <Pressable
            key={source.id}
            style={[
              styles.sourceButton,
              selectedSource === source.id && [styles.sourceButtonActive, { borderColor: source.color }]
            ]}
            onPress={() => handleSourceChange(source.id)}
            android_ripple={{ color: "rgba(255, 255, 255, 0.1)" }}>
            <FontAwesome5
              name={source.icon}
              size={18}
              color={selectedSource === source.id ? source.color : "#888888"}
              style={styles.sourceIcon}
            />
            <Text
              style={[
                styles.sourceText,
                selectedSource === source.id && [styles.sourceTextActive, { color: source.color }]
              ]}>
              {source.label}
            </Text>
            {selectedSource === source.id && <View style={[styles.activeDot, { backgroundColor: source.color }]} />}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#0D0D0D"
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#888888",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  sourceContainer: {
    flexDirection: "row",
    gap: 12
  },
  sourceButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#1A1A1A",
    borderWidth: 2,
    borderColor: "transparent",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4
      },
      android: {
        elevation: 2
      }
    })
  },
  sourceButtonActive: {
    backgroundColor: "#2A2A2A",
    ...Platform.select({
      ios: {
        shadowColor: "#FF6B35",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 6
      },
      android: {
        elevation: 4
      }
    })
  },
  sourceIcon: {
    marginRight: 6
  },
  sourceText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#888888"
  },
  sourceTextActive: {
    fontWeight: "700"
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 6
  }
});
