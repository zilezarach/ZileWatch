import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  Dimensions,
  Switch,
  StatusBar,
  SafeAreaView,
} from "react-native";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { RootStackParamList } from "@/types/navigation";
import Constants from "expo-constants";
import { FontAwesome } from "@expo/vector-icons";
import streamingService, { SearchItem } from "@/utils/streamingService";

const { width } = Dimensions.get("window");
const ITEM_WIDTH = width * 0.28;
const SPOTLIGHT_WIDTH = width * 0.85;

interface HomeData {
  spotlight: any[];
  trending: { movies: any[]; tvSeries: any[] };
  latestMovies: any[];
  latestTvSeries: any[];
}

export default function Movies(): JSX.Element {
  const [homeInfo, setHomeInfo] = useState<HomeData | null>(null);
  const [movies, setMovies] = useState<SearchItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [contentType, setContentType] = useState<"movie" | "series">("movie");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const isMounted = useRef(true);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const searchInputRef = useRef<TextInput>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Fetch homepage data
  useEffect(() => {
    fetchHomeData();
  }, []);

  const fetchHomeData = async () => {
    if (loading) return;
    try {
      setLoading(true);
      const res = await axios.get(
        `${Constants.expoConfig?.extra?.API_Backend}/info`
      );
      if (isMounted.current) {
        setHomeInfo(res.data);
        setLoading(false);
      }
    } catch (e) {
      console.warn("Failed to load home info", e);
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  // Handle search
  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setIsSearching(false);
      setMovies([]);
      return;
    }

    try {
      setIsSearching(true);
      setLoading(true);
      const key = `search_${query}_${contentType}`;
      const cached = await AsyncStorage.getItem(key);

      if (!isMounted.current) return;

      if (cached) {
        setMovies(JSON.parse(cached));
      } else {
        const results = await streamingService.searchContent(
          query,
          contentType
        );
        if (!isMounted.current) return;
        setMovies(results);
        await AsyncStorage.setItem(key, JSON.stringify(results));
      }
    } catch (e) {
      console.error("Search failed:", e);
      Alert.alert("Search Error", "Failed to fetch search results.");
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  // Handle watch action

  const handleWatchNow = async (item: SearchItem) => {
    try {
      setActionLoading(item.id);
      // Check if the item type is explicitly set
      const itemType = item.type || contentType;

      if (itemType === "movie") {
        const info = await streamingService.getMovieStreamingUrl(item.id);

        navigation.navigate("Stream", {
          mediaType: "movie", // Explicitly set as movie
          id: item.id,
          videoTitle: item.title,
          streamUrl: info.streamUrl,
          sourceName: info.selectedServer.name,
        });
      } else {
        navigation.navigate("SeriesDetail", {
          tv_id: item.id,
          title: item.title,
        });
      }
    } catch (e) {
      Alert.alert("Error", "Failed to set up streaming.");
    } finally {
      setActionLoading(null);
    }
  };
  // Toggle content type
  const toggleContentType = () => {
    const newType = contentType === "movie" ? "series" : "movie";
    setContentType(newType);
    if (searchQuery.trim()) {
      handleSearch(searchQuery);
    }
  };

  // Poster component
  const PosterItem = ({
    item,
    size = "normal",
  }: {
    item: any;
    size?: "normal" | "large";
  }) => (
    <TouchableOpacity
      style={[
        styles.posterContainer,
        size === "large" && styles.largePosterContainer,
      ]}
      onPress={() => handleWatchNow(item)}
      activeOpacity={0.7}
    >
      <Image
        source={{ uri: item.poster }}
        style={[
          styles.posterImage,
          size === "large" && styles.largePosterImage,
        ]}
        defaultSource={require("../../assets/images/Original.png")}
      />
      {actionLoading === item.id && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#FF5722" size="large" />
        </View>
      )}
      <Text
        style={[
          styles.posterTitle,
          size === "large" && styles.largePosterTitle,
        ]}
        numberOfLines={1}
      >
        {item.title}
      </Text>
      {size === "large" && item.stats?.rating && (
        <View style={styles.ratingContainer}>
          <FontAwesome name="star" size={12} color="#FFD700" />
          <Text style={styles.ratingText}>{item.stats.rating}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  // Spotlight Banner component
  const SpotlightItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.spotlightContainer}
      onPress={() =>
        handleWatchNow({
          id: item.id,
          title: item.title,
          poster: item.poster,
          stats: { year: item.year, rating: item.rating },
          type: item.mediaType || contentType,
        })
      }
      activeOpacity={0.8}
    >
      <Image
        source={{ uri: item.banner || item.poster }}
        style={styles.spotlightImage}
        defaultSource={require("../../assets/images/Original.png")}
      />
      <View style={styles.spotlightGradient}>
        <Text style={styles.spotlightTitle}>{item.title}</Text>
        <View style={styles.spotlightDetails}>
          {item.year && <Text style={styles.spotlightYear}>{item.year}</Text>}
          {item.rating && (
            <View style={styles.spotlightRating}>
              <FontAwesome name="star" size={12} color="#FFD700" />
              <Text style={styles.spotlightRatingText}>{item.rating}</Text>
            </View>
          )}
        </View>
      </View>
      {actionLoading === item.id && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#FF5722" size="large" />
        </View>
      )}
    </TouchableOpacity>
  );

  // Section header component
  const SectionHeader = ({
    title,
    onPress,
  }: {
    title: string;
    onPress?: () => void;
  }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {onPress && (
        <TouchableOpacity onPress={onPress}>
          <Text style={styles.seeAllText}>See All</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // Horizontal poster list
  const PosterRow = ({
    title,
    data,
    onSeeAll,
  }: {
    title: string;
    data: any[];
    onSeeAll?: () => void;
  }) => (
    <View style={styles.posterRowContainer}>
      <SectionHeader title={title} onPress={onSeeAll} />
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={data || []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PosterItem item={item} />}
        contentContainerStyle={styles.posterRowContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No content available</Text>
        }
      />
    </View>
  );

  // Content type tabs
  const ContentTypeTabs = () => (
    <View style={styles.tabsContainer}>
      <TouchableOpacity
        style={[styles.tab, contentType === "movie" && styles.activeTab]}
        onPress={() => setContentType("movie")}
      >
        <Text
          style={[
            styles.tabText,
            contentType === "movie" && styles.activeTabText,
          ]}
        >
          Movies
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, contentType === "series" && styles.activeTab]}
        onPress={() => setContentType("series")}
      >
        <Text
          style={[
            styles.tabText,
            contentType === "series" && styles.activeTabText,
          ]}
        >
          TV Series
        </Text>
      </TouchableOpacity>
    </View>
  );

  // Search result item
  const SearchResultItem = ({ item }: { item: SearchItem }) => (
    <TouchableOpacity
      style={styles.searchResultItem}
      onPress={() => handleWatchNow(item)}
      activeOpacity={0.7}
    >
      <Image
        source={{ uri: item.poster }}
        style={styles.searchResultImage}
        defaultSource={require("../../assets/images/Original.png")}
      />
      <View style={styles.searchResultDetails}>
        <Text style={styles.searchResultTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <View style={styles.searchResultMeta}>
          {item.stats?.year && (
            <Text style={styles.searchResultYear}>{item.stats.year}</Text>
          )}
          {item.stats?.rating && (
            <View style={styles.ratingContainer}>
              <FontAwesome name="star" size={12} color="#FFD700" />
              <Text style={styles.ratingText}>{item.stats.rating}</Text>
            </View>
          )}
          <Text style={styles.mediaTypeLabel}>
            {item.type === "movie" ? "Movie" : "TV Series"}
          </Text>
        </View>
        {actionLoading === item.id ? (
          <ActivityIndicator size="small" color="#FF5722" />
        ) : (
          <TouchableOpacity
            style={styles.watchButton}
            onPress={() => handleWatchNow(item)}
          >
            <Text style={styles.watchButtonText}>
              {item.type === "series" ? "View Seasons" : "Watch Now"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />

      {/* Header with search */}
      <View style={styles.header}>
        <Text style={styles.appTitle}>
          {isSearching ? "Search" : "MovieStream"}
        </Text>
        <View style={styles.searchContainer}>
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search movies & shows..."
            placeholderTextColor="#888"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={() => handleSearch(searchQuery)}
            returnKeyType="search"
          />
          {searchQuery ? (
            <TouchableOpacity
              style={styles.searchIconButton}
              onPress={() => {
                setSearchQuery("");
                setIsSearching(false);
              }}
            >
              <FontAwesome name="times" size={16} color="#888" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.searchIconButton}
              onPress={() => searchInputRef.current?.focus()}
            >
              <FontAwesome name="search" size={16} color="#888" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content type tabs */}
      <ContentTypeTabs />

      {loading && !isSearching ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#FF5722" />
        </View>
      ) : isSearching ? (
        <FlatList
          data={movies}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <SearchResultItem item={item} />}
          contentContainerStyle={styles.searchResultsContainer}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator size="large" color="#FF5722" />
            ) : (
              <Text style={styles.emptyText}>
                No results found for "{searchQuery}"
              </Text>
            )
          }
        />
      ) : (
        <FlatList
          data={[]}
          keyExtractor={(_, index) => `section_${index}`}
          renderItem={null}
          ListHeaderComponent={
            <>
              {/* Spotlight Section */}
              {homeInfo?.spotlight && homeInfo.spotlight.length > 0 && (
                <View style={styles.spotlightSection}>
                  <SectionHeader title="Spotlight" />
                  <FlatList
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    data={homeInfo.spotlight}
                    keyExtractor={(item) => `spotlight_${item.id}`}
                    renderItem={({ item }) => <SpotlightItem item={item} />}
                    snapToInterval={SPOTLIGHT_WIDTH + 16}
                    decelerationRate="fast"
                    contentContainerStyle={styles.spotlightContent}
                  />
                </View>
              )}

              {/* Trending Section */}
              {homeInfo?.trending && (
                <PosterRow
                  title={`Trending ${
                    contentType === "movie" ? "Movies" : "Shows"
                  }`}
                  data={
                    contentType === "movie"
                      ? homeInfo.trending.movies
                      : homeInfo.trending.tvSeries
                  }
                />
              )}

              {/* Latest Section */}
              {homeInfo && (
                <PosterRow
                  title={`Latest ${
                    contentType === "movie" ? "Movies" : "Shows"
                  }`}
                  data={
                    contentType === "movie"
                      ? homeInfo.latestMovies
                      : homeInfo.latestTvSeries
                  }
                />
              )}
            </>
          }
          contentContainerStyle={styles.homeContent}
          ListEmptyComponent={null}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  header: {
    padding: 16,
    paddingTop: 8,
  },
  appTitle: {
    color: "#FFF",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 12,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    color: "#FFF",
    fontSize: 15,
    height: "100%",
  },
  searchIconButton: {
    padding: 6,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  tabsContainer: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 8,
    backgroundColor: "#1E1E1E",
    padding: 4,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: "#FF5722",
  },
  tabText: {
    color: "#BBB",
    fontWeight: "500",
  },
  activeTabText: {
    color: "#FFF",
    fontWeight: "600",
  },
  spotlightSection: {
    marginBottom: 24,
  },
  spotlightContent: {
    paddingHorizontal: 16,
  },
  spotlightContainer: {
    width: SPOTLIGHT_WIDTH,
    height: 180,
    marginRight: 16,
    borderRadius: 12,
    overflow: "hidden",
  },
  spotlightImage: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
  },
  spotlightGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "50%",
    padding: 12,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  spotlightTitle: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  spotlightDetails: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  spotlightYear: {
    color: "#DDD",
    fontSize: 12,
    marginRight: 8,
  },
  spotlightRating: {
    flexDirection: "row",
    alignItems: "center",
  },
  spotlightRatingText: {
    color: "#FFD700",
    fontSize: 12,
    marginLeft: 4,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginVertical: 12,
  },
  sectionTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "bold",
  },
  seeAllText: {
    color: "#FF5722",
    fontSize: 14,
  },
  posterRowContainer: {
    marginBottom: 24,
  },
  posterRowContent: {
    paddingHorizontal: 16,
  },
  posterContainer: {
    width: ITEM_WIDTH,
    marginRight: 12,
  },
  largePosterContainer: {
    width: ITEM_WIDTH * 1.2,
  },
  posterImage: {
    width: "100%",
    height: ITEM_WIDTH * 1.5,
    borderRadius: 8,
  },
  largePosterImage: {
    height: ITEM_WIDTH * 1.8,
  },
  posterTitle: {
    color: "#FFF",
    fontSize: 12,
    marginTop: 6,
  },
  largePosterTitle: {
    fontSize: 14,
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  ratingText: {
    color: "#FFD700",
    fontSize: 12,
    marginLeft: 4,
  },
  searchResultsContainer: {
    padding: 16,
  },
  searchResultItem: {
    flexDirection: "row",
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    marginBottom: 12,
    overflow: "hidden",
  },
  searchResultImage: {
    width: 80,
    height: 120,
  },
  searchResultDetails: {
    flex: 1,
    padding: 12,
    justifyContent: "space-between",
  },
  searchResultTitle: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  searchResultMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 8,
  },
  searchResultYear: {
    color: "#BBB",
    fontSize: 13,
    marginRight: 8,
  },
  mediaTypeLabel: {
    color: "#888",
    fontSize: 12,
    marginLeft: 8,
    backgroundColor: "#2A2A2A",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  watchButton: {
    backgroundColor: "#FF5722",
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: "center",
  },
  watchButtonText: {
    color: "#FFF",
    fontWeight: "500",
    fontSize: 14,
  },
  homeContent: {
    paddingBottom: 24,
  },
  emptyText: {
    color: "#888",
    textAlign: "center",
    padding: 20,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
});
