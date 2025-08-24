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
  generateCategoriesFromData,
  fetchChannels,
  getStreamUrl,
  getChannelsStream,
  preloadSessions,
  LiveItem,
  TVChannels,
} from "@/utils/liveService";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/types/navigation";
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
const SESSION_RETRY = 2000;
const FEATURED_CARD_HEIGHT = 180;

export default function GamesScreen() {
  const [list, setList] = useState<LiveItem[]>([]);
  const [featuredMatches, setFeaturedMatches] = useState<LiveItem[]>([]);
  const [itemLoadingStates, setItemLoadingStates] = useState<
    Map<string, ItemLoadingState>
  >(new Map());
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
  });
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [sessionStatus, setSessionStatus] = useState<
    "idle" | "loading" | "completed" | "failed"
  >("idle");
  const getItemLoadingState = useCallback(
    (id: string): ItemLoadingState => {
      return (
        itemLoadingStates.get(id) || {
          isLoading: false,
          isInitializing: false,
          error: null,
          lastAttempt: null,
        }
      );
    },
    [itemLoadingStates]
  );

  const updateItemLoadingState = useCallback(
    (id: string, updates: Partial<ItemLoadingState>) => {
      setItemLoadingStates((prev) => {
        const current = prev.get(id) || {
          isLoading: false,
          isInitializing: false,
          error: null,
          lastAttempt: null,
        };
        const newMap = new Map(prev);
        newMap.set(id, { ...current, ...updates });
        return newMap;
      });
    },
    []
  );
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

        // Load live sports first
        const liveData = await fetchLiveSports().catch((err) => {
          console.error("Failed to fetch live sports:", err);
          return [] as LiveItem[];
        });
        // Separate featured matches from regular channels
        const featured = liveData.filter((item) => item.isFeatured);
        const regular = liveData.filter((item) => !item.isFeatured);

        // Generate categories from the live data
        const generatedCategories = generateCategoriesFromData(liveData);

        // Load channels separately
        const channelData = await fetchChannels().catch((err) => {
          console.error("Failed to fetch channels:", err);
          return [] as TVChannels[];
        });

        setList(liveData);
        setFeaturedMatches(featured);
        setRegularChannels(regular);
        setCategories(generatedCategories);

        const processedChannels = channelData.map((channel, index) => {
          const id = channel.id !== undefined ? channel.id : index;
          return {
            id: id,
            name: channel.name || `Channel ${id}`,
            image: channel.image || "",
            streamUrl: channel.streamUrl || "",
          };
        });

        setChannels(processedChannels);
        if (liveData.length > 0 && !isRefresh) {
          const popularChannelIds = liveData.slice(0, 5).map((item) => item.id);
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
    setItemLoadingStates(new Map());
    setSessionStatus("idle");
    loadData(true);
  }, [loadData]);

  // Memoized filtered list for performance
  const filteredList = useMemo(() => {
    if (!selectedCategory) return regularChannels;
    if (selectedCategory === "Featured") return featuredMatches;
    return regularChannels.filter((item) => item.category === selectedCategory);
  }, [regularChannels, featuredMatches, selectedCategory]);

  // Handle image loading errors
  const handleImageError = useCallback((uri: string) => {
    setImageErrors((prev) => new Set([...prev, uri]));
  }, []);

  // Enhanced navigation with error handling
  const navigateToPlayer = useCallback(
    async (title: string, channelId: string, isChannel = false) => {
      const id = channelId.trim();
      if (!id) {
        Alert.alert("Stream Error", "This stream is currently unavailable.");
        return;
      }

      try {
        setLoadingItems((prev) => new Set([...prev, id]));
        setItemErrors((prev) => {
          const newErrors = new Set(prev);
          newErrors.delete(id);
          return newErrors;
        });

        const streamUrl = isChannel
          ? await getChannelsStream(id)
          : await getStreamUrl(id);

        setLoadingItems((prev) => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });

        navigation.navigate("LivePlayer", { title, url: streamUrl });
      } catch (error) {
        console.error("Stream error:", error);
        setLoadingItems((prev) => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });
        setItemErrors((prev) => new Set([...prev, id]));
      }
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

  // Get sport icon based on category
  const getSportIcon = useCallback((category: string) => {
    const cat = category.toLowerCase();
    if (cat.includes("football") || cat.includes("soccer")) return "futbol-o";
    if (cat.includes("basketball")) return "basketball-ball";
    if (cat.includes("tennis")) return "table-tennis";
    if (cat.includes("baseball")) return "baseball-ball";
    if (cat.includes("golf")) return "golf-ball";
    if (cat.includes("hockey")) return "hockey-puck";
    if (cat.includes("boxing") || cat.includes("mma")) return "fist-raised";
    return "trophy"; // Default icon
  }, []);

  const renderMatchAction = (id: string) => {
    const isLoading = loadingItems.has(id);
    const hasError = itemErrors.has(id);

    return (
      <View style={styles.actionContainer}>
        {isLoading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : hasError ? (
          <Pressable
            onPress={() => navigateToPlayer("", id, false)}
            style={styles.retryButton}
          >
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

      return (
        <Animated.View
          style={[
            styles.cardWrapper,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.card,
              pressed && styles.cardPressed,
              { height: CARD_HEIGHT, opacity: isDisabled ? 0.6 : 1 },
            ]}
            onPress={() =>
              !isDisabled && navigateToPlayer(item.match, itemId, false)
            }
            disabled={isDisabled}
            android_ripple={{ color: "rgba(255, 107, 53, 0.2)" }}
          >
            <View style={styles.sportIconContainer}>
              <View style={styles.sportIconBackground}>
                <FontAwesome5
                  name={getSportIcon(item.category)}
                  size={24}
                  color="#FFFFFF"
                />
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
                  <Text style={styles.channelName}>
                    {item.channels?.[0]?.name || "Channel 1"}
                  </Text>
                </View>
                <Text style={styles.matchTime}>
                  {getFormattedTime(item.start)}
                </Text>
              </View>
            </View>
            {renderMatchAction(itemId)}
          </Pressable>
        </Animated.View>
      );
    },
    [
      fadeAnim,
      slideAnim,
      loadingItems,
      itemErrors,
      navigateToPlayer,
      getSportIcon,
    ]
  );

  const renderChannelAction = (id: string) => {
    const isLoading = loadingItems.has(id);
    const hasError = itemErrors.has(id);

    return (
      <View style={styles.channelStatus}>
        {isLoading ? (
          <ActivityIndicator size="small" color="#4CAF50" />
        ) : hasError ? (
          <Pressable
            onPress={() => navigateToPlayer("", id, true)}
            style={styles.retryButtonSmall}
          >
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
          style={[
            styles.channelCardWrapper,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.channelCard,
              pressed && styles.channelCardPressed,
              { height: CHANNEL_CARD_HEIGHT, opacity: isDisabled ? 0.6 : 1 },
            ]}
            onPress={() =>
              !isDisabled && navigateToPlayer(item.name, channelId, true)
            }
            disabled={isDisabled}
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
    [
      fadeAnim,
      slideAnim,
      imageErrors,
      loadingItems,
      itemErrors,
      navigateToPlayer,
      handleImageError,
    ]
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
          <FontAwesome5
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
            <FontAwesome5
              name={getSportIcon(cat)}
              size={14}
              color={selectedCategory === cat ? "#FFFFFF" : "#CCCCCC"}
              style={styles.filterIcon}
            />
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
    [categories, selectedCategory, getSportIcon]
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
  // Matches render
  const renderFeaturedMatch = useCallback(
    ({ item, index }: { item: LiveItem; index: number }) => {
      const itemId = String(item.id);
      const isDisabled = loadingItems.has(itemId);

      return (
        <Animated.View
          style={[
            styles.featuredCardWrapper,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.featuredCard,
              pressed && styles.cardPressed,
              { opacity: isDisabled ? 0.6 : 1 },
            ]}
            onPress={() =>
              !isDisabled && navigateToPlayer(item.match, itemId, false)
            }
            disabled={isDisabled}
            android_ripple={{ color: "rgba(255, 107, 53, 0.2)" }}
          >
            <View style={styles.featuredImageContainer}>
              <Image
                source={{
                  uri:
                    item.logo ||
                    "https://via.placeholder.com/400x200?text=Featured+Match",
                }}
                style={styles.featuredMatchImage}
                onError={() => handleImageError(item.logo || "")}
                defaultSource={require("../../assets/images/HomeLogo.png")}
              />
              <View style={styles.featuredOverlay} />

              {/* Featured Badge */}
              <View style={styles.featuredBadge}>
                <FontAwesome name="star" size={12} color="#FFFFFF" />
                <Text style={styles.featuredBadgeText}>FEATURED</Text>
              </View>

              {/* Match Info Overlay */}
              <View style={[styles.featuredMatchInfo]}>
                <Text style={styles.featuredMatchTitle} numberOfLines={2}>
                  {item.match}
                </Text>
                <View style={[styles.channelThumb, styles.placeholderImage]}>
                  <FontAwesome name="television" size={24} color="#FF6B35" />
                </View>
              </View>
              <View style={styles.channelOverlay} />
              <View style={styles.channelQualityBadge}>
                <Text style={styles.qualityText}>LIVE</Text>
              </View>

              <View style={styles.channelInfo}>
                <Text style={styles.channelName} numberOfLines={1}>
                  {item.channels?.[0]?.name || "TV Channel"}
                </Text>
                {item.channels?.[0]?.id &&
                  renderChannelAction(String(item.channels[0].id))}
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
      loadingItems,
      itemErrors,
      navigateToPlayer,
      handleImageError,
    ]
  );

  //features matches
  const renderFeaturedSection = useCallback(() => {
    if (featuredMatches.length === 0) return null;

    return (
      <View style={styles.featuredSection}>
        <View style={styles.featuredSectionHeader}>
          <View style={styles.featuredHeaderLeft}>
            <FontAwesome name="star" size={20} color="#FF6B35" />
            <Text style={styles.featuredSectionTitle}>Featured Matches</Text>
          </View>
          <Text style={styles.featuredCount}>
            {featuredMatches.length} live
          </Text>
        </View>

        <FlatList
          data={featuredMatches}
          renderItem={renderFeaturedMatch}
          keyExtractor={(item, index) => `featured_${item.id}_${index}`}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.featuredScrollContent}
          ItemSeparatorComponent={() => (
            <View style={styles.featuredSeparator} />
          )}
          snapToInterval={300}
          decelerationRate="fast"
          getItemLayout={(data, index) => ({
            length: 280,
            offset: 280 * index,
            index,
          })}
        />
      </View>
    );
  }, [featuredMatches, renderFeaturedMatch]);

  // Stats header component
  const renderStatsHeader = useCallback(() => {
    const count = showChannels ? channels.length : filteredList.length;
    const label = showChannels ? "channels" : count === 1 ? "match" : "matches";

    return (
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {showChannels
            ? "Live TV Channels"
            : selectedCategory === "Featured"
            ? "Featured Matches"
            : "Live Sports"}
        </Text>
        <View style={styles.headerStats}>
          <View style={styles.statsItem}>
            <Text style={styles.statsNumber}>{count}</Text>
            <Text style={styles.statsLabel}>
              {selectedCategory === "Featured"
                ? "featured matches"
                : `live ${label}`}
            </Text>
          </View>
          <View style={styles.liveIndicatorHeader}>
            <View style={styles.pulseDot} />
            <Text style={styles.liveStatusText}>Broadcasting</Text>
          </View>
        </View>
      </View>
    );
  }, [showChannels, channels.length, filteredList.length, selectedCategory]);

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
          contentContainerStyle={styles.scrollContent}
        >
          {/* Featured Matches Section - Always show if available */}
          {featuredMatches.length > 0 && renderFeaturedSection()}

          {/* Category Filter */}
          {categories.length > 0 && renderCategoryFilter()}

          {/* Stats Header */}
          {renderStatsHeader()}

          {/* Regular Matches List */}
          {filteredList.length > 0
            ? filteredList.map((item, index) => (
                <View key={`${item.id}_${index}`}>
                  {renderMatch({ item, index })}
                </View>
              ))
            : renderEmptyState()}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D0D0D",
  },
  scrollContent: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0D0D0D",
  },
  retryButtonSmall: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255, 107, 53, 0.1)",
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
  featuredSection: {
    marginBottom: 32,
    paddingTop: 8,
  },
  featuredSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  featuredHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  featuredSectionTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#FFFFFF",
    marginLeft: 12,
  },
  featuredCount: {
    fontSize: 14,
    color: "#FF6B35",
    fontWeight: "600",
    backgroundColor: "rgba(255, 107, 53, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  featuredScrollContent: {
    paddingLeft: 20,
    paddingRight: 20,
  },
  featuredSeparator: {
    width: 16,
  },

  // Featured Card Styles
  featuredCardWrapper: {
    width: 280,
  },
  featuredCard: {
    height: FEATURED_CARD_HEIGHT,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#1A1A1A",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
      },
      android: {
        elevation: 12,
      },
    }),
    borderWidth: 2,
    borderColor: "#FF6B35",
  },
  featuredImageContainer: {
    flex: 1,
    position: "relative",
  },
  featuredMatchImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "#2A2A2A",
  },
  featuredOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  featuredBadge: {
    position: "absolute",
    top: 16,
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF6B35",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  featuredBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "bold",
    marginLeft: 6,
  },
  featuredMatchInfo: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 80,
  },
  featuredMatchTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FFFFFF",
    marginBottom: 8,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  featuredMatchMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  featuredLeague: {
    fontSize: 14,
    color: "#FF6B35",
    fontWeight: "600",
    marginRight: 12,
  },
  featuredTime: {
    fontSize: 14,
    color: "#CCCCCC",
    fontWeight: "500",
  },
  featuredPlayButtonContainer: {
    position: "absolute",
    bottom: 16,
    right: 16,
  },
  featuredLiveIndicator: {
    backgroundColor: "#FF6B35",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 12,
  },
  featuredPlayButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    backdropFilter: "blur(10px)",
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
    borderRadius: 16,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  // New Sports Card Styles
  sportIconContainer: {
    width: 80,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 16,
    borderRightWidth: 1,
    borderRightColor: "#2A2A2A",
  },
  sportIconBackground: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FF6B35",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  categoryBadge: {
    fontSize: 12,
    fontWeight: "600",
    color: "#CCCCCC",
    textAlign: "center",
  },
  matchDetailsContainer: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
    justifyContent: "space-between",
  },
  matchTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 12,
    lineHeight: 24,
  },
  matchMetaContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  channelInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  channelName: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "500",
    marginLeft: 6,
  },
  matchTime: {
    fontSize: 14,
    color: "#888888",
    fontWeight: "500",
  },
  actionContainer: {
    width: 80,
    justifyContent: "center",
    alignItems: "center",
    borderLeftWidth: 1,
    borderLeftColor: "#2A2A2A",
  },
  liveIndicator: {
    backgroundColor: "#FF6B35",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
    marginRight: 6,
  },
  liveText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "bold",
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 107, 53, 0.2)",
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
  placeholderImage: {
    justifyContent: "center",
    alignItems: "center",
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
  qualityText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "bold",
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
