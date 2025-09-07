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
  SafeAreaView
} from "react-native";
import {
  loadCachedStreams,
  fetchLiveSports,
  generateCategoriesFromData,
  fetchChannels,
  getStreamUrl,
  getChannelsStream,
  preloadSessions,
  LiveItem,
  TVChannels
} from "../../utils/liveService";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../types/navigation";
import { FontAwesome, FontAwesome5 } from "@expo/vector-icons";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

interface LoadingState {
  initial: boolean;
  refreshing: boolean;
  error: string | null;
}
interface ItemLoadingState {
  isLoading: boolean;
  isInitializing: boolean;
  error: string | null;
  lastAttempt: number | null;
}

const ANIMATION_DURATION = 200;
const CARD_HEIGHT = 140;
const CHANNEL_CARD_HEIGHT = 140;

export default function GamesScreen() {
  const [list, setList] = useState<LiveItem[]>([]);
  const [itemLoadingStates, setItemLoadingStates] = useState<Map<string, ItemLoadingState>>(new Map());
  const [regularChannels, setRegularChannels] = useState<LiveItem[]>([]);
  const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());
  const [itemErrors, setItemErrors] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [channels, setChannels] = useState<TVChannels[]>([]);
  const [showChannels, setShowChannels] = useState(false);
  const [loadingState, setLoadingState] = useState<LoadingState>({
    initial: true,
    refreshing: false,
    error: null
  });
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [sessionStatus, setSessionStatus] = useState<"idle" | "loading" | "completed" | "failed">("idle");

  const getItemLoadingState = useCallback(
    (id: string): ItemLoadingState => {
      return (
        itemLoadingStates.get(id) || {
          isLoading: false,
          isInitializing: false,
          error: null,
          lastAttempt: null
        }
      );
    },
    [itemLoadingStates]
  );

  const updateItemLoadingState = useCallback((id: string, updates: Partial<ItemLoadingState>) => {
    setItemLoadingStates(prev => {
      const current = prev.get(id) || {
        isLoading: false,
        isInitializing: false,
        error: null,
        lastAttempt: null
      };
      const newMap = new Map(prev);
      newMap.set(id, { ...current, ...updates });
      return newMap;
    });
  }, []);

  // Animation values
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(50));

  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const loadData = useCallback(
    async (isRefresh = false) => {
      console.log("Starting loadData, isRefresh:", isRefresh);
      try {
        setLoadingState(prev => ({
          ...prev,
          refreshing: isRefresh,
          error: null
        }));

        console.log("Fetching live sports...");
        const liveData = await fetchLiveSports();
        console.log("Live sports data:", liveData);

        console.log("Fetching channels...");
        const channelData = await fetchChannels();
        console.log("Channel data:", channelData);

        const regular = liveData.filter(item => !item.isFeatured);
        console.log("Regular channels:", regular);

        const generatedCategories = generateCategoriesFromData(regular);
        console.log("Generated categories:", generatedCategories);

        setList(regular);
        setRegularChannels(regular);
        setCategories(generatedCategories);

        const processedChannels = channelData.map((channel, index) => ({
          id: channel.id !== undefined ? channel.id : index,
          name: channel.name || `Channel ${index}`,
          image: channel.image || "",
          streamUrl: channel.streamUrl || ""
        }));
        console.log("Processed channels:", processedChannels);

        setChannels(processedChannels);

        if (regular.length > 0 && !isRefresh) {
          const popularChannelIds = regular.slice(0, 5).map(item => item.id);
          console.log("Preloading sessions for:", popularChannelIds);
          setSessionStatus("loading");

          preloadSessions(popularChannelIds)
            .then(() => {
              console.log("Session preloading completed");
              setSessionStatus("completed");
            })
            .catch((error: any) => {
              console.warn("Session preloading failed:", error);
              setSessionStatus("failed");
            });
        }

        if (!isRefresh) {
          Animated.parallel([
            Animated.timing(fadeAnim, {
              toValue: 1,
              duration: ANIMATION_DURATION,
              useNativeDriver: true
            }),
            Animated.timing(slideAnim, {
              toValue: 0,
              duration: ANIMATION_DURATION,
              useNativeDriver: true
            })
          ]).start();
        }
      } catch (error: any) {
        console.error("Critical error loading data:", error, error.stack);
        setLoadingState(prev => ({
          ...prev,
          error: error.message || "Failed to load content"
        }));

        Alert.alert(
          "Connection Error",
          `Unable to load live content: ${error.message || "Please check your internet connection."}`,
          [
            { text: "Retry", onPress: () => loadData(isRefresh) },
            { text: "Cancel", style: "cancel" }
          ]
        );
      } finally {
        console.log("loadData completed, loadingState:", loadingState);
        setLoadingState(prev => ({
          ...prev,
          initial: false,
          refreshing: false
        }));
      }
    },
    [fadeAnim, slideAnim]
  );

  const onRefresh = useCallback(() => {
    setItemLoadingStates(new Map());
    setSessionStatus("idle");
    loadData(true);
  }, [loadData]);

  const filteredList = useMemo(() => {
    if (!selectedCategory) return regularChannels;
    return regularChannels.filter(item => item.category === selectedCategory);
  }, [regularChannels, selectedCategory]);

  const handleImageError = useCallback((uri: string) => {
    setImageErrors(prev => new Set([...prev, uri]));
  }, []);

  const navigateToPlayer = useCallback(
    async (title: string, channelId: string, isChannel = false, streamUrl?: string, m3u8Url?: string) => {
      const id = channelId.trim();
      if (!id) {
        Alert.alert("Stream Error", "This stream is currently unavailable.");
        return;
      }

      try {
        setLoadingItems(prev => new Set([...prev, id]));
        setItemErrors(prev => {
          const newErrors = new Set(prev);
          newErrors.delete(id);
          return newErrors;
        });

        let url: string;

        // Priority order: m3u8Url -> streamUrl -> fetch from API
        if (m3u8Url) {
          console.log(`Using direct m3u8Url for ${title}`);
          url = m3u8Url;
        } else if (streamUrl) {
          console.log(`Using provided streamUrl for ${title}`);
          url = streamUrl;
        } else {
          console.log(`Fetching stream URL for ${title}`);
          url = isChannel ? await getChannelsStream(id) : await getStreamUrl(id);
        }

        setLoadingItems(prev => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });

        navigation.navigate("LivePlayer", { title, url });
      } catch (error) {
        console.error("Stream error:", error);
        setLoadingItems(prev => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });
        setItemErrors(prev => new Set([...prev, id]));
        Alert.alert("Stream Error", "Failed to load stream. Please try again.");
      }
    },
    [navigation]
  );
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

  const getSportIcon = useCallback((category: string) => {
    const cat = category.toLowerCase();
    if (cat.includes("football") || cat.includes("soccer")) return "futbol-o";
    if (cat.includes("basketball")) return "basketball-ball";
    if (cat.includes("tennis")) return "table-tennis";
    if (cat.includes("baseball")) return "baseball-ball";
    if (cat.includes("golf")) return "golf-ball";
    if (cat.includes("hockey")) return "hockey-puck";
    if (cat.includes("boxing") || cat.includes("mma")) return "fist-raised";
    return "trophy";
  }, []);

  const renderMatchAction = (id: string, item?: LiveItem) => {
    const isLoading = loadingItems.has(id);
    const hasError = itemErrors.has(id);
    const m3u8Url = item?.channels?.[0]?.streamUrl;

    return (
      <View style={styles.actionContainer}>
        {isLoading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : hasError ? (
          <Pressable
            onPress={() =>
              navigateToPlayer(
                item?.match || "",
                id,
                false,
                undefined, // streamUrl
                m3u8Url // m3u8Url
              )
            }
            style={styles.retryButton}>
            <FontAwesome name="refresh" size={14} color="#FFFFFF" />
          </Pressable>
        ) : (
          <>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
            <View style={styles.playButton}>
              <FontAwesome name="play" size={14} color="#FFFFFF" />
            </View>
          </>
        )}
      </View>
    );
  };

  const renderMatch = useCallback(
    ({ item, index }: { item: LiveItem; index: number }) => {
      const itemId = String(item.id);
      const isDisabled = loadingItems.has(itemId);
      // Get the m3u8Url directly from the item data
      const m3u8Url = item.channels?.[0]?.streamUrl;

      return (
        <Animated.View style={[styles.cardWrapper, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Pressable
            style={({ pressed }) => [
              styles.card,
              pressed && styles.cardPressed,
              { height: CARD_HEIGHT, opacity: isDisabled ? 0.6 : 1 }
            ]}
            onPress={() =>
              !isDisabled &&
              navigateToPlayer(
                item.match,
                itemId,
                false,
                undefined, // streamUrl
                m3u8Url // m3u8Url - this will be used directly
              )
            }
            disabled={isDisabled}
            android_ripple={{ color: "rgba(255, 107, 53, 0.2)" }}>
            <View style={styles.sportIconContainer}>
              <View style={styles.sportIconBackground}>
                <FontAwesome5 name={getSportIcon(item.category)} size={24} color="#FFFFFF" />
              </View>
              <Text style={styles.categoryBadge} numberOfLines={1}>
                {item.category || "Sports"}
              </Text>
            </View>

            <View style={styles.matchDetailsContainer}>
              <Text style={styles.matchTitle} numberOfLines={2}>
                {item.match || "Live Event"}
              </Text>
              <View style={styles.matchMetaContainer}>
                <View style={styles.channelInfo}>
                  <FontAwesome name="tv" size={12} color="#FF6B35" />
                  <Text style={styles.channelName}>{item.channels?.[0]?.name || "Channel 1"}</Text>
                </View>
                <Text style={styles.matchTime}>{getFormattedTime(item.start)}</Text>
              </View>
            </View>
            {renderMatchAction(itemId, item)}
          </Pressable>
        </Animated.View>
      );
    },
    [fadeAnim, slideAnim, loadingItems, itemErrors, navigateToPlayer, getSportIcon]
  );

  const renderChannelAction = (id: string) => {
    const isLoading = loadingItems.has(id);
    const hasError = itemErrors.has(id);

    return (
      <View style={styles.channelStatus}>
        {isLoading ? (
          <ActivityIndicator size="small" color="#4CAF50" />
        ) : hasError ? (
          <Pressable onPress={() => navigateToPlayer("", id, true)} style={styles.retryButtonSmall}>
            <FontAwesome name="refresh" size={12} color="#FF6B35" />
          </Pressable>
        ) : (
          <>
            <View style={styles.onlineIndicator} />
            <Text style={styles.onlineText}>Broadcasting</Text>
          </>
        )}
      </View>
    );
  };

  const renderChannel = useCallback(
    ({ item, index }: { item: TVChannels; index: number }) => {
      const channelId = String(item.id) || `channel_${index}`;
      const isDisabled = loadingItems.has(channelId);
      const hasImageError = imageErrors.has(item.image || "");

      return (
        <Animated.View
          style={[styles.channelCardWrapper, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Pressable
            style={({ pressed }) => [
              styles.channelCard,
              pressed && styles.channelCardPressed,
              { height: CHANNEL_CARD_HEIGHT, opacity: isDisabled ? 0.6 : 1 }
            ]}
            onPress={() => !isDisabled && navigateToPlayer(item.name, channelId, true, item.streamUrl)}
            disabled={isDisabled}
            android_ripple={{ color: "rgba(255, 107, 53, 0.2)" }}>
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
              <View style={styles.channelQualityBadge}>
                <Text style={styles.qualityText}>LIVE</Text>
              </View>
            </View>

            <View style={styles.channelInfo}>
              <Text style={styles.channelName} numberOfLines={1}>
                {item.name || "TV Channel"}
              </Text>
              {renderChannelAction(channelId)}
            </View>
          </Pressable>
        </Animated.View>
      );
    },
    [fadeAnim, slideAnim, imageErrors, loadingItems, itemErrors, navigateToPlayer, handleImageError]
  );

  const renderCategoryFilter = useCallback(
    () => (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterScrollContent}>
        <Pressable
          onPress={() => setSelectedCategory(null)}
          style={[styles.filterButton, !selectedCategory && styles.activeFilter]}
          android_ripple={{ color: "rgba(255, 107, 53, 0.2)" }}>
          <FontAwesome5
            name="globe"
            size={14}
            color={!selectedCategory ? "#FFFFFF" : "#CCCCCC"}
            style={styles.filterIcon}
          />
          <Text style={[styles.filterText, !selectedCategory && styles.activeFilterText]}>All Sports</Text>
        </Pressable>
        {categories.map(cat => (
          <Pressable
            key={cat}
            onPress={() => setSelectedCategory(cat)}
            style={[styles.filterButton, selectedCategory === cat && styles.activeFilter]}
            android_ripple={{ color: "rgba(255, 107, 53, 0.2)" }}>
            <FontAwesome5
              name={getSportIcon(cat)}
              size={14}
              color={selectedCategory === cat ? "#FFFFFF" : "#CCCCCC"}
              style={styles.filterIcon}
            />
            <Text style={[styles.filterText, selectedCategory === cat && styles.activeFilterText]}>{cat}</Text>
          </Pressable>
        ))}
      </ScrollView>
    ),
    [categories, selectedCategory, getSportIcon]
  );

  const renderEmptyState = useCallback(
    () => (
      <View style={styles.emptyState}>
        <FontAwesome name="tv" size={64} color="#444444" />
        <Text style={styles.emptyTitle}>No Content Available</Text>
        <Text style={styles.emptySubtitle}>{showChannels ? "No TV channels found" : "No live matches available"}</Text>
        <Pressable style={styles.retryButton} onPress={() => loadData()}>
          <FontAwesome name="refresh" size={16} color="#FFFFFF" />
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    ),
    [showChannels, loadData]
  );

  const renderStatsHeader = useCallback(() => {
    const count = showChannels ? channels.length : filteredList.length;
    const label = showChannels ? "channels" : count === 1 ? "match" : "matches";

    return (
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{showChannels ? "Live TV Channels" : "Live Sports"}</Text>
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
    // Load cached streams on mount
    loadCachedStreams().then(() => loadData());
  }, [loadData]);

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
      <View style={styles.headerContainer}>
        <View style={styles.headerContent}>
          <Text style={styles.appTitle}>ZileWatch LiveTV</Text>
          <Text style={styles.appSubtitle}>Live Sports & Entertainment</Text>
        </View>
      </View>
      <View style={styles.segmentContainer}>
        <View style={styles.segmentBackground}>
          <Pressable
            style={[styles.segmentButton, !showChannels && styles.segmentActive]}
            onPress={() => setShowChannels(false)}
            android_ripple={{ color: "rgba(255, 255, 255, 0.1)" }}>
            <FontAwesome
              name="futbol-o"
              size={16}
              color={!showChannels ? "#FFFFFF" : "#888888"}
              style={styles.segmentIcon}
            />
            <Text style={[styles.segmentText, !showChannels && styles.segmentTextActive]}>Sports</Text>
          </Pressable>
          <Pressable
            style={[styles.segmentButton, showChannels && styles.segmentActive]}
            onPress={() => setShowChannels(true)}
            android_ripple={{ color: "rgba(255, 255, 255, 0.1)" }}>
            <FontAwesome
              name="television"
              size={16}
              color={showChannels ? "#FFFFFF" : "#888888"}
              style={styles.segmentIcon}
            />
            <Text style={[styles.segmentText, showChannels && styles.segmentTextActive]}>Channels</Text>
          </Pressable>
        </View>
      </View>
      {showChannels ? (
        <FlatList
          data={channels}
          keyExtractor={(item, index) => item?.id?.toString() || `channel-${index}`}
          renderItem={renderChannel}
          contentContainerStyle={[styles.listContent, channels.length === 0 && styles.emptyContainer]}
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
        />
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={loadingState.refreshing}
              onRefresh={onRefresh}
              tintColor="#FF6B35"
              colors={["#FF6B35"]}
            />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
          {categories.length > 0 && renderCategoryFilter()}
          {renderStatsHeader()}
          {filteredList.length > 0
            ? filteredList.map((item, index) => <View key={`${item.id}_${index}`}>{renderMatch({ item, index })}</View>)
            : renderEmptyState()}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D0D0D"
  },
  scrollContent: {
    paddingBottom: 40
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0D0D0D"
  },
  retryButtonSmall: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255, 107, 53, 0.1)"
  },
  loadingContent: {
    alignItems: "center",
    padding: 32
  },
  loadingSpinner: {
    marginBottom: 20
  },
  loadingText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8
  },
  loadingSubtext: {
    color: "#888888",
    fontSize: 14,
    textAlign: "center"
  },
  headerContainer: {
    paddingTop: Platform.OS === "ios" ? 20 : 16,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: "#0D0D0D"
  },
  headerContent: {
    alignItems: "center"
  },
  appTitle: {
    fontSize: 32,
    fontWeight: "900",
    color: "#FFFFFF",
    marginBottom: 4
  },
  appSubtitle: {
    fontSize: 16,
    color: "#888888",
    fontWeight: "500"
  },
  segmentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 16
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
        shadowRadius: 4
      },
      android: {
        elevation: 3
      }
    })
  },
  segmentButton: {
    flex: 1,
    flexDirection: "row",
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12
  },
  segmentIcon: {
    marginRight: 8
  },
  segmentActive: {
    backgroundColor: "#FF6B35",
    ...Platform.select({
      ios: {
        shadowColor: "#FF6B35",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4
      },
      android: {
        elevation: 5
      }
    })
  },
  segmentText: {
    color: "#888888",
    fontWeight: "700",
    fontSize: 16
  },
  segmentTextActive: {
    color: "#FFFFFF"
  },
  filterScroll: {
    marginVertical: 12
  },
  filterScrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 4
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
    borderColor: "#333333"
  },
  filterIcon: {
    marginRight: 6
  },
  activeFilter: {
    backgroundColor: "#FF6B35",
    borderColor: "#FF6B35",
    ...Platform.select({
      ios: {
        shadowColor: "#FF6B35",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4
      },
      android: {
        elevation: 3
      }
    })
  },
  filterText: {
    color: "#CCCCCC",
    fontSize: 14,
    fontWeight: "600"
  },
  activeFilterText: {
    color: "#FFFFFF"
  },
  listContent: {
    padding: 20,
    paddingBottom: 40
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center"
  },
  header: {
    marginBottom: 24,
    paddingTop: 8
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: "#FFFFFF",
    marginBottom: 16
  },
  headerStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  statsItem: {
    flexDirection: "row",
    alignItems: "baseline"
  },
  statsNumber: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FF6B35",
    marginRight: 8
  },
  statsLabel: {
    fontSize: 16,
    color: "#888888",
    fontWeight: "500"
  },
  liveIndicatorHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF6B35",
    marginRight: 8
  },
  liveStatusText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600"
  },
  cardWrapper: {
    marginBottom: 16
  },
  card: {
    flexDirection: "row",
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8
      },
      android: {
        elevation: 6
      }
    }),
    borderWidth: 1,
    borderColor: "#2A2A2A"
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }]
  },
  sportIconContainer: {
    width: 80,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 16,
    borderRightWidth: 1,
    borderRightColor: "#2A2A2A"
  },
  sportIconBackground: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FF6B35",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8
  },
  categoryBadge: {
    fontSize: 12,
    fontWeight: "600",
    color: "#CCCCCC",
    textAlign: "center"
  },
  matchDetailsContainer: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
    justifyContent: "space-between"
  },
  matchTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 12,
    lineHeight: 24
  },
  matchMetaContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  channelInfo: {
    flexDirection: "row",
    alignItems: "center"
  },
  channelName: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "500",
    marginLeft: 6
  },
  matchTime: {
    fontSize: 14,
    color: "#888888",
    fontWeight: "500"
  },
  actionContainer: {
    width: 80,
    justifyContent: "center",
    alignItems: "center",
    borderLeftWidth: 1,
    borderLeftColor: "#2A2A2A"
  },
  liveIndicator: {
    backgroundColor: "#FF6B35",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
    marginRight: 6
  },
  liveText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "bold"
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 107, 53, 0.2)",
    justifyContent: "center",
    alignItems: "center"
  },
  separator: {
    height: 16
  },
  channelCardWrapper: {
    flex: 1,
    margin: 8
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
        shadowRadius: 12
      },
      android: {
        elevation: 8
      }
    }),
    borderWidth: 1,
    borderColor: "#2A2A2A"
  },
  channelCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }]
  },
  channelImageContainer: {
    position: "relative",
    height: 90,
    flex: 1
  },
  channelThumb: {
    width: "100%",
    height: "100%",
    backgroundColor: "#2A2A2A"
  },
  placeholderImage: {
    justifyContent: "center",
    alignItems: "center"
  },
  channelOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.1)"
  },
  channelQualityBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#FF6B35",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  qualityText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "bold"
  },
  channelStatus: {
    flexDirection: "row",
    alignItems: "center"
  },
  onlineIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4CAF50",
    marginRight: 6
  },
  onlineText: {
    color: "#4CAF50",
    fontSize: 12,
    fontWeight: "500"
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    paddingHorizontal: 32
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginTop: 24,
    marginBottom: 12,
    textAlign: "center"
  },
  emptySubtitle: {
    fontSize: 16,
    color: "#888888",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32
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
        shadowRadius: 8
      },
      android: {
        elevation: 6
      }
    })
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 16,
    marginLeft: 8
  }
});
