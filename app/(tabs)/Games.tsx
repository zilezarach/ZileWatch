import React, { useEffect, useState } from "react";
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
  Platform
} from "react-native";
import { fetchLiveSports, fetchCategories, fetchChannels, LiveItem, TVChannels } from "@/utils/liveService";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/types/navigation";

const { width: screenWidth } = Dimensions.get("window");

export default function GamesScreen() {
  const [list, setList] = useState<LiveItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [channels, setChannels] = useState<TVChannels[]>([]);
  const [showChannels, setShowChannels] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const loadData = async () => {
    try {
      const [liveData, catData, channelData] = await Promise.all([
        fetchLiveSports(),
        fetchCategories(),
        fetchChannels()
      ]);
      setList(liveData);
      setCategories(catData);
      setChannels(channelData);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingContent}>
          <ActivityIndicator size="large" color="#FF6B35" />
          <Text style={styles.loadingText}>Loading content...</Text>
        </View>
      </View>
    );
  }

  const filteredList = selectedCategory ? list.filter(item => item.category === selectedCategory) : list;

  const renderMatch = ({ item }: { item: LiveItem }) => (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() =>
        navigation.navigate("LivePlayer", {
          title: item.match,
          url: item.channels[0].streamUrl
        })
      }>
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: item.channels[0].streamUrl.replace(".m3u8", ".jpg") }}
          style={styles.thumb}
          defaultSource={require("../../assets/images/HomeLogo.png")}
        />
        <View style={styles.gradientOverlay} />
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      <View style={styles.contentContainer}>
        <Text style={styles.match} numberOfLines={2}>
          {item.match}
        </Text>
        <View style={styles.metaInfo}>
          <View style={styles.channelContainer}>
            <View style={styles.channelDot} />
            <Text style={styles.channel}>{item.channels[0].name}</Text>
          </View>
          <Text style={styles.time}>{new Date(item.start).toLocaleTimeString([], { timeStyle: "short" })}</Text>
        </View>
      </View>

      <View style={styles.playButton}>
        <View style={styles.playIconContainer}>
          <Text style={styles.playIcon}>▶</Text>
        </View>
      </View>
    </Pressable>
  );

  const renderChannel = ({ item }: { item: TVChannels }) => (
    <Pressable
      style={({ pressed }) => [styles.channelCard, pressed && styles.channelCardPressed]}
      onPress={() => navigation.navigate("LivePlayer", { title: item.name, url: item.streamUrl })}>
      <View style={styles.channelImageContainer}>
        <Image
          source={{ uri: item.image }}
          style={styles.channelThumb}
          defaultSource={require("../../assets/images/HomeLogo.png")}
        />
        <View style={styles.channelOverlay} />
      </View>
      <View style={styles.channelInfo}>
        <Text style={styles.channelName} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.channelStatus}>
          <View style={styles.onlineIndicator} />
          <Text style={styles.onlineText}>Online</Text>
        </View>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />

      {/* Enhanced Header */}
      <View style={styles.headerContainer}>
        <View style={styles.headerContent}>
          <Text style={styles.appTitle}>ZileWatch LiveTV Central</Text>
          <Text style={styles.appSubtitle}>Live streaming</Text>
        </View>
      </View>

      {/* Enhanced Segment Control */}
      <View style={styles.segmentContainer}>
        <View style={styles.segmentBackground}>
          <Pressable
            style={[styles.segmentButton, !showChannels && styles.segmentActive]}
            onPress={() => setShowChannels(false)}>
            <Text style={[styles.segmentText, !showChannels && styles.segmentTextActive]}> Matches</Text>
          </Pressable>
          <Pressable
            style={[styles.segmentButton, showChannels && styles.segmentActive]}
            onPress={() => setShowChannels(true)}>
            <Text style={[styles.segmentText, showChannels && styles.segmentTextActive]}>Channels</Text>
          </Pressable>
        </View>
      </View>

      {showChannels ? (
        <FlatList
          data={channels}
          keyExtractor={(item, index) => (item?.id != null ? item.id.toString() : index.toString())}
          renderItem={renderChannel}
          contentContainerStyle={styles.listContent}
          numColumns={2}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF6B35" colors={["#FF6B35"]} />
          }
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <>
          {/* Enhanced Category Filters */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
            contentContainerStyle={styles.filterScrollContent}>
            <Pressable
              onPress={() => setSelectedCategory(null)}
              style={[styles.filterButton, !selectedCategory && styles.activeFilter]}>
              <Text style={[styles.filterText, !selectedCategory && styles.activeFilterText]}>All Sports</Text>
            </Pressable>
            {categories.map(cat => (
              <Pressable
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                style={[styles.filterButton, selectedCategory === cat && styles.activeFilter]}>
                <Text style={[styles.filterText, selectedCategory === cat && styles.activeFilterText]}>{cat}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <FlatList
            data={filteredList}
            keyExtractor={item => item.id.toString()}
            renderItem={renderMatch}
            ListHeaderComponent={() => (
              <View style={styles.header}>
                <Text style={styles.headerTitle}>Live Sports</Text>
                <View style={styles.headerStats}>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsNumber}>{filteredList.length}</Text>
                    <Text style={styles.statsLabel}>live {filteredList.length === 1 ? "match" : "matches"}</Text>
                  </View>
                  <View style={styles.liveIndicatorHeader}>
                    <View style={styles.pulseDot} />
                    <Text style={styles.liveStatusText}>Broadcasting</Text>
                  </View>
                </View>
              </View>
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF6B35" colors={["#FF6B35"]} />
            }
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D0D0D"
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0D0D0D"
  },
  loadingContent: {
    alignItems: "center",
    padding: 20
  },
  loadingText: {
    color: "#FFFFFF",
    fontSize: 16,
    marginTop: 16,
    fontWeight: "500"
  },
  headerContainer: {
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: "#0D0D0D"
  },
  headerContent: {
    alignItems: "center"
  },
  appTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 4
  },
  appSubtitle: {
    fontSize: 14,
    color: "#888888",
    fontWeight: "500"
  },
  segmentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 16
  },
  segmentBackground: {
    flexDirection: "row",
    borderRadius: 12,
    backgroundColor: "#1A1A1A",
    padding: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  segmentButton: {
    flex: 1,
    padding: 12,
    alignItems: "center",
    borderRadius: 8
  },
  segmentActive: {
    backgroundColor: "#FF6B35",
    shadowColor: "#FF6B35",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5
  },
  segmentText: {
    color: "#888888",
    fontWeight: "600",
    fontSize: 16
  },
  segmentTextActive: {
    color: "#FFFFFF"
  },
  filterScroll: {
    marginVertical: 8
  },
  filterScrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 8
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 12,
    borderRadius: 20,
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#333333"
  },
  activeFilter: {
    backgroundColor: "#FF6B35",
    borderColor: "#FF6B35",
    shadowColor: "#FF6B35",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3
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
  header: {
    marginBottom: 24,
    paddingTop: 8
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "900",
    color: "#FFFFFF",
    marginBottom: 12
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
  card: {
    flexDirection: "row",
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1,
    borderColor: "#2A2A2A"
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }]
  },
  imageContainer: {
    position: "relative",
    width: 140,
    height: 100
  },
  thumb: {
    width: "100%",
    height: "100%",
    backgroundColor: "#2A2A2A"
  },
  gradientOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.1)"
  },
  liveIndicator: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "#FF6B35",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
    marginRight: 4
  },
  liveText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "bold"
  },
  contentContainer: {
    flex: 1,
    padding: 16,
    justifyContent: "space-between"
  },
  match: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
    lineHeight: 24
  },
  metaInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  channelContainer: {
    flexDirection: "row",
    alignItems: "center"
  },
  channelDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#FF6B35",
    marginRight: 6
  },
  channel: {
    fontSize: 14,
    color: "#FF6B35",
    fontWeight: "600"
  },
  time: {
    fontSize: 12,
    color: "#888888",
    fontWeight: "500"
  },
  playButton: {
    justifyContent: "center",
    alignItems: "center",
    width: 60,
    backgroundColor: "#FF6B35"
  },
  playIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center"
  },
  playIcon: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 2
  },
  separator: {
    height: 16
  },
  channelCard: {
    flex: 1,
    margin: 8,
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1,
    borderColor: "#2A2A2A"
  },
  channelCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }]
  },
  channelImageContainer: {
    position: "relative",
    height: 100
  },
  channelThumb: {
    width: "100%",
    height: "100%",
    backgroundColor: "#2A2A2A"
  },
  channelOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.1)"
  },
  channelInfo: {
    padding: 12
  },
  channelName: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 16,
    marginBottom: 4
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
  }
});
