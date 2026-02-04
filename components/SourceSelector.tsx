import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { FontAwesome5 } from "@expo/vector-icons";
import { Source } from "../utils/liveService";

interface SourceSelectorProps {
  selectedSource: Source;
  onSourceChange: (source: Source) => void;
  disabled?: boolean;
}

export default function SourceSelector({ selectedSource, onSourceChange, disabled = false }: SourceSelectorProps) {
  const sources: Array<{
    id: Source;
    label: string;
    icon: string;
    color: string;
    description: string;
  }> = [
    {
      id: "dlhd",
      label: "DLHD",
      icon: "tv",
      color: "#4CAF50",
      description: "Premium Sports Channels"
    },
    {
      id: "viprow",
      label: "VIPRow",
      icon: "globe",
      color: "#FF6B35",
      description: "Live Sports Events"
    }
  ];

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Stream Source</Text>
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: sources.find(s => s.id === selectedSource)?.color }]} />
          <Text style={styles.statusText}>{sources.find(s => s.id === selectedSource)?.label}</Text>
        </View>
      </View>

      <View style={styles.sourceContainer}>
        {sources.map(source => {
          const isActive = selectedSource === source.id;

          return (
            <Pressable
              key={source.id}
              style={({ pressed }) => [
                styles.sourceButton,
                isActive && [styles.sourceButtonActive, { borderColor: source.color }],
                disabled && styles.sourceButtonDisabled,
                pressed && !disabled && styles.sourceButtonPressed
              ]}
              onPress={() => !disabled && onSourceChange(source.id)}
              disabled={disabled}
              android_ripple={{ color: "rgba(255, 255, 255, 0.1)" }}>
              <View style={styles.sourceContent}>
                <View style={[styles.iconContainer, isActive && { backgroundColor: `${source.color}20` }]}>
                  <FontAwesome5 name={source.icon} size={20} color={isActive ? source.color : "#888888"} />
                </View>

                <View style={styles.sourceTextContainer}>
                  <Text style={[styles.sourceText, isActive && [styles.sourceTextActive, { color: source.color }]]}>
                    {source.label}
                  </Text>
                  <Text style={styles.sourceDescription}>{source.description}</Text>
                </View>

                {isActive && (
                  <View style={styles.checkContainer}>
                    <FontAwesome5 name="check-circle" size={16} color={source.color} solid />
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}
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
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#888888",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF"
  },
  sourceContainer: {
    gap: 12
  },
  sourceButton: {
    borderRadius: 16,
    backgroundColor: "#1A1A1A",
    borderWidth: 2,
    borderColor: "transparent",
    overflow: "hidden",
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
  sourceButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }]
  },
  sourceButtonDisabled: {
    opacity: 0.5
  },
  sourceContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#2A2A2A",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12
  },
  sourceTextContainer: {
    flex: 1
  },
  sourceText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#888888",
    marginBottom: 2
  },
  sourceTextActive: {
    fontWeight: "800"
  },
  sourceDescription: {
    fontSize: 12,
    color: "#666666",
    fontWeight: "500"
  },
  checkContainer: {
    marginLeft: 8
  }
});
