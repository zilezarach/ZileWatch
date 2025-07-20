import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
  Dimensions,
  Platform,
  Alert,
  Animated,
  SafeAreaView,
} from "react-native";
import {
  fetchLiveSports,
  fetchCategories,
  fetchChannels,
  LiveItem,
  TVChannels,
} from "@/utils/liveService";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/types/navigation";
import { FontAwesome } from "@expo/vector-icons";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

interface LoadingState {
  initial: boolean;
  refreshing: boolean;
  error: string | null;
}

const ANIMATION_DURATION = 200;
const CARD_HEIGHT = 120;
const CHANNEL_CARD_HEIGHT = 140;

export default function GamesScreen() {
  const [list, setList] = useState<LiveItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [channels, setChannels] = useState<TVChannels[]>([]);
  const [showChannels, setShowChannels] = useState(false);
  const [loadingState, setLoadingState] = useState<LoadingState>({
    initial: true,
    refreshing: false,
    error: null,
  });
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  // Animation values

  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(50));

  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const loadData = useCallback(
    async (isRefresh = false) => {
      try {
        setLoadingState((prev) => ({
          ...prev,
          refreshing: isRefresh,
          error: null,
        }));

        const promises = [
          fetchLiveSports().catch((err) => {
            console.error("Failed to fetch live sports:", err);
            return [] as LiveItem[];
          }),
          fetchCategories().catch((err) => {
            console.error("Failed to fetch categories:", err);
            return [] as string[];
          }),
          fetchChannels().catch((err) => {
            console.error("Failed to fetch channels:", err);
            return [] as TVChannels[];
          }),
        ] as const;

        const [liveData, catData, channelData] = await Promise.all(promises);

        setList(liveData);
        setCategories(catData);
        setChannels(channelData);

        // Animate content in
        if (!isRefresh) {
          Animated.parallel([
            Animated.timing(fadeAnim, {
              toValue: 1,
              duration: ANIMATION_DURATION,
              useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
              toValue: 0,
              duration: ANIMATION_DURATION,
              useNativeDriver: true,
            }),
          ]).start();
        }
      } catch (error: any) {
        console.error("Critical error loading data:", error);
        setLoadingState((prev) => ({
          ...prev,
          error: error.message || "Failed to load content",
        }));

        Alert.alert(
          "Connection Error",
          "Unable to load live content. Please check your internet connection.",
          [
            { text: "Retry", onPress: () => loadData(isRefresh) },
            { text: "Cancel", style: "cancel" },
          ]
        );
      } finally {
        setLoadingState((prev) => ({
          ...prev,
          initial: false,
          refreshing: false,
        }));
      }
    },
    [fadeAnim, slideAnim]
  );

  const onRefresh = useCallback(() => {
    loadData(true);
  }, [loadData]);

  // Memoized filtered list for performance
  const filteredList = useMemo(() => {
    if (!selectedCategory) return list;
    return list.filter((item) => item.category === selectedCategory);
  }, [list, selectedCategory]);

  // Handle image loading errors
  const handleImageError = useCallback((uri: string) => {
    setImageErrors((prev) => new Set([...prev, uri]));
  }, []);

  // Enhanced navigation with error handling
  const navigateToPlayer = useCallback(
    (title: string, url: string) => {
      if (!url || url.trim() === "") {
        Alert.alert("Stream Error", "This stream is currently unavailable.");
        return;
      }

      navigation.navigate("LivePlayer", { title, url });
    },
    [navigation]
  );

  // Get formatted time with error handling
  const getFormattedTime = useCallback((dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return "Live Now";
      }
      return date.toLocaleTimeString([], { timeStyle: "short" });
    } catch (error) {
      return "Live Now";
    }
  }, []);

  const renderMatch = useCallback(
    ({ item, index }: { item: LiveItem; index: number }) => {
      const imageUri = item.channels?.[0]?.streamUrl?.replace(".m3u8", ".jpg");
      const hasImageError = imageErrors.has(imageUri || "");

      return (
        <Animated.View
          style={[
            styles.cardWrapper,
            {
              opacity: fadeAnim,
              transform: [
                {
                  translateY: slideAnim.interpolate({
                    inputRange: [0, 50],
                    outputRange: [0, 50],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.card,
              pressed && styles.cardPressed,
              { height: CARD_HEIGHT },
            ]}
            onPress={() =>
              navigateToPlayer(item.match, item.channels?.[0]?.streamUrl)
            }
            android_ripple={{ color: "rgba(255, 107, 53, 0.2)" }}
          >
            <View style={styles.imageContainer}>
              {!hasImageError && imageUri ? (
                <Image
                  source={{ uri: imageUri }}
                  style={styles.thumb}
                  onError={() => handleImageError(imageUri)}
                  defaultSource={require("../../assets/images/HomeLogo.png")}
                />
              ) : (
                <View style={[styles.thumb, styles.placeholderImage]}>
                  <FontAwesome name="play-circle" size={32} color="#FF6B35" />
                </View>
              )}
              <View style={styles.gradientOverlay} />

              {/* Enhanced live indicator with pulse animation */}
              <View style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>

              {/* Quality indicator */}
              <View style={styles.qualityBadge}>
                <Text style={styles.qualityText}>HD</Text>
              </View>
            </View>

            <View style={styles.contentContainer}>
              <Text style={styles.match} numberOfLines={2}>
                {item.match || "Live Match"}
              </Text>
              <Text style={styles.category} numberOfLines={1}>
                {item.category || "Sports"}
              </Text>

              <View style={styles.metaInfo}>
                <View style={styles.channelContainer}>
                  <FontAwesome name="tv" size={12} color="#FF6B35" />
                  <Text style={styles.channel}>
                    {item.channels?.[0]?.name || "Channel 1"}
                  </Text>
                </View>
                <Text style={styles.time}>{getFormattedTime(item.start)}</Text>
              </View>
            </View>

            <View style={styles.playButton}>
              <View style={styles.playIconContainer}>
                <FontAwesome name="play" size={16} color="#FFFFFF" />
              </View>
            </View>
          </Pressable>
        </Animated.View>
      );
    },
    [
      fadeAnim,
      slideAnim,
      imageErrors,
      navigateToPlayer,
      handleImageError,
      getFormattedTime,
    ]
  );

  const renderChannel = useCallback(
    ({ item, index }: { item: TVChannels; index: number }) => {
      const hasImageError = imageErrors.has(item.image || "");

      return (
        <Animated.View
          style={[
            styles.channelCardWrapper,
            {
              opacity: fadeAnim,
              transform: [
                {
                  translateY: slideAnim.interpolate({
                    inputRange: [0, 50],
                    outputRange: [0, 50],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.channelCard,
              pressed && styles.channelCardPressed,
              { height: CHANNEL_CARD_HEIGHT },
            ]}
            onPress={() => navigateToPlayer(item.name, item.streamUrl)}
            android_ripple={{ color: "rgba(255, 107, 53, 0.2)" }}
          >
            <View style={styles.channelImageContainer}>
              {!hasImageError && item.image ? (
                <Image
                  source={{ uri: item.image }}
                  style={styles.channelThumb}
                  onError={() => handleImageError(item.image || "")}
                  defaultSource={require("../../assets/images/HomeLogo.png")}
                />
              ) : (
                <View style={[styles.channelThumb, styles.placeholderImage]}>
                  <FontAwesome name="television" size={24} color="#FF6B35" />
                </View>
              )}
              <View style={styles.channelOverlay} />

              {/* Channel quality indicator */}
              <View style={styles.channelQualityBadge}>
                <Text style={styles.qualityText}>LIVE</Text>
              </View>
            </View>

            <View style={styles.channelInfo}>
              <Text style={styles.channelName} numberOfLines={1}>
                {item.name || "TV Channel"}
              </Text>
              <View style={styles.channelStatus}>
                <View style={styles.onlineIndicator} />
                <Text style={styles.onlineText}>Broadcasting</Text>
              </View>
            </View>
          </Pressable>
        </Animated.View>
      );
    },
    [fadeAnim, slideAnim, imageErrors, navigateToPlayer, handleImageError]
  );

  const renderCategoryFilter = useCallback(
    () => (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterScrollContent}
      >
        <Pressable
          onPress={() => setSelectedCategory(null)}
          style={[
            styles.filterButton,
            !selectedCategory && styles.activeFilter,
          ]}
          android_ripple={{ color: "rgba(255, 107, 53, 0.2)" }}
        >
          <FontAwesome
            name="globe"
            size={14}
            color={!selectedCategory ? "#FFFFFF" : "#CCCCCC"}
            style={styles.filterIcon}
          />
          <Text
            style={[
              styles.filterText,
              !selectedCategory && styles.activeFilterText,
            ]}
          >
            All Sports
          </Text>
        </Pressable>
        {categories.map((cat) => (
          <Pressable
            key={cat}
            onPress={() => setSelectedCategory(cat)}
            style={[
              styles.filterButton,
              selectedCategory === cat && styles.activeFilter,
            ]}
            android_ripple={{ color: "rgba(255, 107, 53, 0.2)" }}
          >
            <Text
              style={[
                styles.filterText,
                selectedCategory === cat && styles.activeFilterText,
              ]}
            >
              {cat}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    ),
    [categories, selectedCategory]
  );
  const renderEmptyState = useCallback(
    () => (
      <View style={styles.emptyState}>
        <FontAwesome name="tv" size={64} color="#444444" />
        <Text style={styles.emptyTitle}>No Content Available</Text>
        <Text style={styles.emptySubtitle}>
          {showChannels ? "No TV channels found" : "No live matches available"}
        </Text>
        <Pressable style={styles.retryButton} onPress={() => loadData()}>
          <FontAwesome name="refresh" size={16} color="#FFFFFF" />
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    ),
    [showChannels, loadData]
  );

  // Stats header component
  const renderStatsHeader = useCallback(() => {
    const count = showChannels ? channels.length : filteredList.length;
    const label = showChannels ? "channels" : count === 1 ? "match" : "matches";

    return (
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {showChannels ? "Live TV Channels" : "Live Sports"}
        </Text>
        <View style={styles.headerStats}>
          <View style={styles.statsItem}>
            <Text style={styles.statsNumber}>{count}</Text>
            <Text style={styles.statsLabel}>live {label}</Text>
          </View>
          <View style={styles.liveIndicatorHeader}>
            <View style={styles.pulseDot} />
            <Text style={styles.liveStatusText}>Broadcasting</Text>
          </View>
        </View>
      </View>
    );
  }, [showChannels, channels.length, filteredList.length]);
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (!loadingState.initial) {
        loadData(true);
      }
    }, [loadData, loadingState.initial])
  );
  if (loadingState.initial) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />
        <View style={styles.loadingContent}>
          <View style={styles.loadingSpinner}>
            <ActivityIndicator size="large" color="#FF6B35" />
          </View>
          <Text style={styles.loadingText}>Loading Live Content...</Text>
          <Text style={styles.loadingSubtext}>Fetching the latest streams</Text>
        </View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />

      {/* Enhanced Header */}
      <View style={styles.headerContainer}>
        <View style={styles.headerContent}>
          <Text style={styles.appTitle}>ZileWatch LiveTV</Text>
          <Text style={styles.appSubtitle}>Live Sports & Entertainment</Text>
        </View>
      </View>

      {/* Enhanced Segment Control */}
      <View style={styles.segmentContainer}>
        <View style={styles.segmentBackground}>
          <Pressable
            style={[
              styles.segmentButton,
              !showChannels && styles.segmentActive,
            ]}
            onPress={() => setShowChannels(false)}
            android_ripple={{ color: "rgba(255, 255, 255, 0.1)" }}
          >
            <FontAwesome
              name="futbol-o"
              size={16}
              color={!showChannels ? "#FFFFFF" : "#888888"}
              style={styles.segmentIcon}
            />
            <Text
              style={[
                styles.segmentText,
                !showChannels && styles.segmentTextActive,
              ]}
            >
              Sports
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segmentButton, showChannels && styles.segmentActive]}
            onPress={() => setShowChannels(true)}
            android_ripple={{ color: "rgba(255, 255, 255, 0.1)" }}
          >
            <FontAwesome
              name="television"
              size={16}
              color={showChannels ? "#FFFFFF" : "#888888"}
              style={styles.segmentIcon}
            />
            <Text
              style={[
                styles.segmentText,
                showChannels && styles.segmentTextActive,
              ]}
            >
              Channels
            </Text>
          </Pressable>
        </View>
      </View>

      {showChannels ? (
        <FlatList
          data={channels}
          keyExtractor={(item, index) =>
            item?.id?.toString() || `channel-${index}`
          }
          renderItem={renderChannel}
          contentContainerStyle={[
            styles.listContent,
            channels.length === 0 && styles.emptyContainer,
          ]}
          numColumns={2}
          refreshControl={
            <RefreshControl
              refreshing={loadingState.refreshing}
              onRefresh={onRefresh}
              tintColor="#FF6B35"
              colors={["#FF6B35"]}
            />
          }
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={renderStatsHeader}
          ListEmptyComponent={renderEmptyState}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={10}
          getItemLayout={(data, index) => ({
            length: CHANNEL_CARD_HEIGHT + 16,
            offset: (CHANNEL_CARD_HEIGHT + 16) * Math.floor(index / 2),
            index,
          })}
        />
      ) : (
        <>
          {categories.length > 0 && renderCategoryFilter()}

          <FlatList
            data={filteredList}
            keyExtractor={(item, index) =>
              item?.id?.toString() || `match-${index}`
            }
            renderItem={renderMatch}
            ListHeaderComponent={renderStatsHeader}
            contentContainerStyle={[
              styles.listContent,
              filteredList.length === 0 && styles.emptyContainer,
            ]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={loadingState.refreshing}
                onRefresh={onRefresh}
                tintColor="#FF6B35"
                colors={["#FF6B35"]}
              />
            }
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={renderEmptyState}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={12}
            getItemLayout={(data, index) => ({
              length: CARD_HEIGHT + 16,
              offset: (CARD_HEIGHT + 16) * index,
              index,
            })}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D0D0D",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0D0D0D",
  },
  loadingContent: {
    alignItems: "center",
    padding: 32,
  },
  loadingSpinner: {
    marginBottom: 20,
  },
  loadingText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  loadingSubtext: {
    color: "#888888",
    fontSize: 14,
    textAlign: "center",
  },
  headerContainer: {
    paddingTop: Platform.OS === "ios" ? 20 : 16,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: "#0D0D0D",
  },
  headerContent: {
    alignItems: "center",
  },
  appTitle: {
    fontSize: 32,
    fontWeight: "900",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  appSubtitle: {
    fontSize: 16,
    color: "#888888",
    fontWeight: "500",
  },
  segmentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  segmentBackground: {
    flexDirection: "row",
    borderRadius: 16,
    backgroundColor: "#1A1A1A",
    padding: 6,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  segmentButton: {
    flex: 1,
    flexDirection: "row",
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  segmentIcon: {
    marginRight: 8,
  },
  segmentActive: {
    backgroundColor: "#FF6B35",
    ...Platform.select({
      ios: {
        shadowColor: "#FF6B35",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  segmentText: {
    color: "#888888",
    fontWeight: "700",
    fontSize: 16,
  },
  segmentTextActive: {
    color: "#FFFFFF",
  },
  filterScroll: {
    marginVertical: 12,
  },
  filterScrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginRight: 12,
    borderRadius: 24,
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#333333",
  },
  filterIcon: {
    marginRight: 6,
  },
  activeFilter: {
    backgroundColor: "#FF6B35",
    borderColor: "#FF6B35",
    ...Platform.select({
      ios: {
        shadowColor: "#FF6B35",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  filterText: {
    color: "#CCCCCC",
    fontSize: 14,
    fontWeight: "600",
  },
  activeFilterText: {
    color: "#FFFFFF",
  },
  listContent: {
    padding: 20,
    paddingBottom: 40,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
  },
  header: {
    marginBottom: 24,
    paddingTop: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: "#FFFFFF",
    marginBottom: 16,
  },
  headerStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statsItem: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  statsNumber: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FF6B35",
    marginRight: 8,
  },
  statsLabel: {
    fontSize: 16,
    color: "#888888",
    fontWeight: "500",
  },
  liveIndicatorHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF6B35",
    marginRight: 8,
  },
  liveStatusText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  cardWrapper: {
    marginBottom: 16,
  },
  card: {
    flexDirection: "row",
    backgroundColor: "#1A1A1A",
    borderRadius: 20,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  imageContainer: {
    position: "relative",
    width: 140,
    flex: 0,
  },
  thumb: {
    width: "100%",
    height: "100%",
    backgroundColor: "#2A2A2A",
  },
  placeholderImage: {
    justifyContent: "center",
    alignItems: "center",
  },
  gradientOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  liveIndicator: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "#FF6B35",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  qualityBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  qualityText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "bold",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
    marginRight: 4,
  },
  liveText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "bold",
  },
  contentContainer: {
    flex: 1,
    padding: 16,
    justifyContent: "space-between",
  },
  match: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
    lineHeight: 22,
  },
  category: {
    fontSize: 12,
    color: "#FF6B35",
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  metaInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  channelContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  channel: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "600",
    marginLeft: 6,
  },
  time: {
    fontSize: 12,
    color: "#888888",
    fontWeight: "500",
  },
  playButton: {
    justifyContent: "center",
    alignItems: "center",
    width: 70,
    backgroundColor: "#FF6B35",
  },
  playIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  separator: {
    height: 16,
  },
  channelCardWrapper: {
    flex: 1,
    margin: 8,
  },
  channelCard: {
    flex: 1,
    backgroundColor: "#1A1A1A",
    borderRadius: 20,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  channelCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  channelImageContainer: {
    position: "relative",
    height: 90,
    flex: 1,
  },
  channelThumb: {
    width: "100%",
    height: "100%",
    backgroundColor: "#2A2A2A",
  },
  channelOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  channelQualityBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#FF6B35",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  channelInfo: {
    padding: 12,
    height: 50,
  },
  channelName: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 16,
    marginBottom: 4,
  },
  channelStatus: {
    flexDirection: "row",
    alignItems: "center",
  },
  onlineIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4CAF50",
    marginRight: 6,
  },
  onlineText: {
    color: "#4CAF50",
    fontSize: 12,
    fontWeight: "500",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginTop: 24,
    marginBottom: 12,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 16,
    color: "#888888",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF6B35",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    ...Platform.select({
      ios: {
        shadowColor: "#FF6B35",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 16,
    marginLeft: 8,
  },
});
