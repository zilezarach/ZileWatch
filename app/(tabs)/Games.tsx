import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
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
  clearStreamCache,
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
  sportsLoading: boolean;
  channelsLoading: boolean;
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
    error: null,
    sportsLoading: false,
    channelsLoading: false
  });
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [sessionStatus, setSessionStatus] = useState<"idle" | "loading" | "completed" | "failed">("idle");

  // Refs to prevent race conditions
  const isLoadingRef = useRef(false);
  const lastFetchRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  // Animation values
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(50));

  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const loadSportsData = useCallback(
    async (signal?: AbortSignal): Promise<LiveItem[]> => {
      if (signal?.aborted) throw new Error("Aborted");

      setLoadingState(prev => ({
        ...prev,
        sportsLoading: true,
        error: null
      }));

      try {
        const liveData = await fetchLiveSports(signal);
        if (signal?.aborted) throw new Error("Aborted");

        const regular = liveData.filter(item => !item.isFeatured);
        const generatedCategories = generateCategoriesFromData(regular);

        if (isMountedRef.current && !signal?.aborted) {
          setList(regular);
          setRegularChannels(regular);
          setCategories(generatedCategories);

          // Preload sessions for top 5 channels
          if (regular.length > 0 && sessionStatus === "idle") {
            const topChannelIds = regular.slice(0, 5).map(item => item.id);
            setSessionStatus("loading");

            preloadSessions(topChannelIds)
              .then(() => {
                if (isMountedRef.current) {
                  setSessionStatus("completed");
                }
              })
              .catch((error: any) => {
                console.warn("Session preloading failed:", error);
                if (isMountedRef.current) {
                  setSessionStatus("failed");
                }
              });
          }
        }

        return regular;
      } finally {
        if (isMountedRef.current) {
          setLoadingState(prev => ({ ...prev, sportsLoading: false }));
        }
      }
    },
    [sessionStatus]
  );

  const loadChannelsData = useCallback(async (signal?: AbortSignal): Promise<TVChannels[]> => {
    if (signal?.aborted) throw new Error("Aborted");

    setLoadingState(prev => ({
      ...prev,
      channelsLoading: true,
      error: null
    }));

    try {
      const channelData = await fetchChannels();
      if (signal?.aborted) throw new Error("Aborted");

      const processedChannels = channelData.map((channel, index) => ({
        id: channel.id !== undefined ? channel.id : index,
        name: channel.name || `Channel ${index}`,
        image: channel.image || "",
        streamUrl: channel.streamUrl || ""
      }));

      if (isMountedRef.current && !signal?.aborted) {
        setChannels(processedChannels);
      }

      return processedChannels;
    } finally {
      if (isMountedRef.current) {
        setLoadingState(prev => ({ ...prev, channelsLoading: false }));
      }
    }
  }, []);

  const loadData = useCallback(
    async (isRefresh = false, forceReload = false) => {
      if (isLoadingRef.current && !forceReload) {
        console.log("Load already in progress, skipping...");
        return;
      }

      const now = Date.now();
      if (now - lastFetchRef.current < 1000 && !isRefresh && !forceReload) {
        console.log("Debouncing load request...");
        return;
      }

      isLoadingRef.current = true;
      lastFetchRef.current = now;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      const { signal } = abortControllerRef.current;

      try {
        setLoadingState(prev => ({
          ...prev,
          refreshing: isRefresh,
          error: null,
          initial: !isRefresh && prev.initial
        }));

        console.log("📺 Loading DLHD sports data, isRefresh:", isRefresh);

        const [sportsData, channelsData] = await Promise.allSettled([loadSportsData(signal), loadChannelsData(signal)]);

        if (signal.aborted) return;

        if (sportsData.status === "rejected") {
          console.error("Sports data loading failed:", sportsData.reason);
        }

        if (channelsData.status === "rejected") {
          console.error("Channels data loading failed:", channelsData.reason);
        }

        if (sportsData.status === "rejected" && channelsData.status === "rejected") {
          throw new Error("Failed to load both sports and channels data");
        }

        if (!isRefresh && isMountedRef.current) {
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
        if (signal.aborted) return;

        console.error("Critical error loading data:", error);

        if (isMountedRef.current) {
          setLoadingState(prev => ({
            ...prev,
            error: error.message || "Failed to load content"
          }));

          if (!isRefresh) {
            Alert.alert(
              "Connection Error",
              `Unable to load live content: ${error.message || "Please check your internet connection."}`,
              [
                { text: "Retry", onPress: () => loadData(false, true) },
                { text: "Cancel", style: "cancel" }
              ]
            );
          }
        }
      } finally {
        isLoadingRef.current = false;
        if (isMountedRef.current) {
          setLoadingState(prev => ({
            ...prev,
            initial: false,
            refreshing: false
          }));
        }
      }
    },
    [loadSportsData, loadChannelsData, fadeAnim, slideAnim]
  );

  const onRefresh = useCallback(() => {
    setItemLoadingStates(new Map());
    setItemErrors(new Set());
    setSessionStatus("idle");
    clearStreamCache();
    loadData(true, true);
  }, [loadData]);

  const filteredList = useMemo(() => {
    if (!selectedCategory) return regularChannels;
    return regularChannels.filter(item => item.category === selectedCategory);
  }, [regularChannels, selectedCategory]);

  const handleImageError = useCallback((uri: string) => {
    setImageErrors(prev => new Set([...prev, uri]));
  }, []);

  const navigateToPlayer = useCallback(
    async (title: string, channelId: string, isChannel = false, streamUrl?: string, item?: LiveItem) => {
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

        if (isChannel) {
          url = await getChannelsStream(id);
        } else {
          // Use provided streamUrl if available (from DLHD cache)
          if (streamUrl) {
            url = streamUrl;
          } else {
            url = await getStreamUrl(id, undefined, streamUrl);
          }
        }

        setLoadingItems(prev => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });

        navigation.navigate("LivePlayer", { title, url, channelId, isChannel });
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
    if (cat.includes("f1") || cat.includes("formula")) return "flag-checkered";
    return "trophy";
  }, []);

  const renderMatchAction = useCallback(
    (id: string, item?: LiveItem) => {
      const isLoading = loadingItems.has(id);
      const hasError = itemErrors.has(id);
      const streamUrl = item?.streamUrl;

      return (
        <View style={styles.actionContainer}>
          {isLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : hasError ? (
            <Pressable
              onPress={() => navigateToPlayer(item?.match || "", id, false, streamUrl, item)}
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
    },
    [loadingItems, itemErrors, navigateToPlayer]
  );

  const renderMatch = useCallback(
    ({ item, index }: { item: LiveItem; index: number }) => {
      const itemId = String(item.id);
      const isDisabled = loadingItems.has(itemId);
      const streamUrl = item.streamUrl;

      return (
        <Animated.View style={[styles.cardWrapper, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Pressable
            style={({ pressed }) => [
              styles.card,
              pressed && styles.cardPressed,
              { height: CARD_HEIGHT, opacity: isDisabled ? 0.6 : 1 }
            ]}
            onPress={() => !isDisabled && navigateToPlayer(item.match, itemId, false, streamUrl, item)}
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
    [fadeAnim, slideAnim, loadingItems, navigateToPlayer, getSportIcon, getFormattedTime, renderMatchAction]
  );

  const renderChannelAction = useCallback(
    (id: string) => {
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
    },
    [loadingItems, itemErrors, navigateToPlayer]
  );

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
    [fadeAnim, slideAnim, imageErrors, loadingItems, navigateToPlayer, handleImageError, renderChannelAction]
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

  const renderEmptyState = useCallback(() => {
    return (
      <View style={styles.emptyState}>
        <FontAwesome name="tv" size={64} color="#444444" />
        <Text style={styles.emptyTitle}>No Content Available</Text>
        <Text style={styles.emptySubtitle}>
          {showChannels ? "No TV channels found" : "No live sports channels available at the moment"}
        </Text>
        <Pressable style={styles.retryButton} onPress={() => loadData(false, true)}>
          <FontAwesome name="refresh" size={16} color="#FFFFFF" />
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }, [showChannels, loadData]);

  const renderStatsHeader = useCallback(() => {
    const count = showChannels ? channels.length : filteredList.length;
    const label = showChannels ? "channels" : count === 1 ? "channel" : "channels";
    const isLoading = showChannels ? loadingState.channelsLoading : loadingState.sportsLoading;

    return (
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{showChannels ? "Live TV Channels" : "Live Sports Channels"}</Text>
        <View style={styles.headerStats}>
          <View style={styles.statsItem}>
            {isLoading ? (
              <ActivityIndicator size="small" color="#FF6B35" style={{ marginRight: 8 }} />
            ) : (
              <Text style={styles.statsNumber}>{count}</Text>
            )}
            <Text style={styles.statsLabel}>live {label}</Text>
          </View>
          <View style={styles.liveIndicatorHeader}>
            <View style={styles.pulseDot} />
            <Text style={styles.liveStatusText}>Broadcasting</Text>
          </View>
        </View>
      </View>
    );
  }, [showChannels, channels.length, filteredList.length, loadingState.channelsLoading, loadingState.sportsLoading]);

  useEffect(() => {
    isMountedRef.current = true;

    loadCachedStreams().then(() => {
      if (isMountedRef.current) {
        loadData();
      }
    });

    return () => {
      isMountedRef.current = false;
      isLoadingRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      const isStale = Date.now() - lastFetchRef.current > 5 * 60 * 1000;

      if (!loadingState.initial && isStale && !isLoadingRef.current) {
        console.log("Data is stale, refreshing...");
        loadData(true);
      }
    }, [loadData, loadingState.initial])
  );

  const handleTabSwitch = useCallback(
    (showChannelsTab: boolean) => {
      setShowChannels(showChannelsTab);

      if (showChannelsTab && channels.length === 0 && !loadingState.channelsLoading) {
        loadChannelsData();
      }

      if (!showChannelsTab && regularChannels.length === 0 && !loadingState.sportsLoading) {
        loadSportsData();
      }
    },
    [
      channels.length,
      regularChannels.length,
      loadingState.channelsLoading,
      loadingState.sportsLoading,
      loadChannelsData,
      loadSportsData
    ]
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
          <Text style={styles.loadingSubtext}>Fetching DLHD channels</Text>
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
            onPress={() => handleTabSwitch(false)}
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
            onPress={() => handleTabSwitch(true)}
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
          removeClippedSubviews={true}
          getItemLayout={(data, index) => ({
            length: CHANNEL_CARD_HEIGHT + 16,
            offset: (CHANNEL_CARD_HEIGHT + 16) * Math.floor(index / 2),
            index
          })}
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
  streamedInfo: {
    marginTop: 24,
    marginBottom: 16,
    alignItems: "center"
  },
  streamedInfoText: {
    fontSize: 14,
    color: "#888888",
    marginBottom: 12,
    fontWeight: "600"
  },
  categoriesList: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    gap: 6
  },
  categoryChipText: {
    fontSize: 12,
    color: "#FFFFFF",
    fontWeight: "500"
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
