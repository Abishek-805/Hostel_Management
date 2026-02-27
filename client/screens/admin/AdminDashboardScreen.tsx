import React, { useRef, useEffect, useState, useMemo } from "react";
import { StyleSheet, View, ScrollView, Pressable, RefreshControl, Modal, FlatList, Animated as RNAnimated, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeInRight, useSharedValue, withRepeat, withTiming, useAnimatedStyle, Easing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { FloatingBackground } from "@/components/FloatingBackground";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { getQueryFn } from "@/lib/query-client";
import { AdminStackParamList } from "@/navigation/AdminTabNavigator";

type NavigationProp = NativeStackNavigationProp<AdminStackParamList>;
const { width } = Dimensions.get('window');

const BlinkingDot = ({ color }: { color: string }) => {
  const opacity = useRef(new RNAnimated.Value(0.3)).current;
  useEffect(() => {
    RNAnimated.loop(RNAnimated.sequence([
      RNAnimated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: false }),
      RNAnimated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: false }),
    ])).start();
  }, [opacity]);
  return <RNAnimated.View style={[styles.dot, { backgroundColor: color, opacity }]} />;
};

interface StatCardProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  value: number | string;
  color: string;
  onPress?: () => void;
  showAlert?: boolean;
}

function StatCard({ icon, title, value, color, onPress, showAlert }: StatCardProps) {
  const { theme } = useTheme();
  return (
    <Pressable style={[styles.statCard, { backgroundColor: theme.backgroundSecondary }]} onPress={onPress}>
      <View style={styles.statHeader}>
        <View style={[styles.statIcon, { backgroundColor: color + "15" }]}><Feather name={icon} size={22} color={color} /></View>
        {showAlert && (
          <View style={[styles.alertBadge, { backgroundColor: color + '20' }]}>
            <BlinkingDot color={color} />
            <ThemedText type="caption" style={{ color: color, fontWeight: '700', fontSize: 10 }}>ACTION</ThemedText>
          </View>
        )}
      </View>
      <ThemedText type="h1" style={[styles.statValue, { color }]}>{value}</ThemedText>
      <ThemedText type="caption" secondary>{title}</ThemedText>
    </Pressable>
  );
}

export default function AdminDashboardScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const flatListRef = useRef<FlatList>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ['/stats/admin'],
    queryFn: getQueryFn({ on401: 'throw' }),
    enabled: user?.role === 'admin',
    staleTime: 0,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });
  const { data: hostelSettings } = useQuery({ 
    queryKey: ['hostel-settings', user?.hostelBlock], 
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!user?.hostelBlock,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const CAROUSEL_ITEMS = [
    { id: 1, title: "Hostel Occupancy", subtitle: "Block A is almost full", bg: [Colors.primary.main, Colors.primary.pressed], icon: "home" },
    { id: 2, title: "Leave Approvals", subtitle: "New requests pending", bg: [Colors.status.warning, "#d97706"], icon: "clock" },
    { id: 3, title: "Maintenance", subtitle: "3 Reports resolved", bg: [Colors.secondary.main, Colors.secondary.pressed], icon: "tool" },
  ];

  const infiniteCarouselData = useMemo(() => {
    if (CAROUSEL_ITEMS.length === 0) return [];
    return [...CAROUSEL_ITEMS, ...CAROUSEL_ITEMS, ...CAROUSEL_ITEMS];
  }, [CAROUSEL_ITEMS]);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prevIndex) => {
        const nextIndex = prevIndex + 1;
        if (nextIndex < infiniteCarouselData.length) {
          flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true, viewPosition: 0 });
          return nextIndex;
        }
        const middleIndex = CAROUSEL_ITEMS.length;
        if (flatListRef.current) {
          flatListRef.current.scrollToIndex({ index: middleIndex, animated: false });
        }
        return middleIndex + 1;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [infiniteCarouselData.length]);

  const logoScale = useSharedValue(1);
  useEffect(() => {
    logoScale.value = withRepeat(withTiming(1.08, { duration: 2000, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [logoScale]);

  const logoAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: logoScale.value }] }));

  const adminStats = stats as any || { studentCount: 0, attendanceCount: 0, pendingLeaveCount: 0, openComplaintCount: 0, pendingRoomChanges: 0, vacantRoomsCount: 0, totalRoomsCount: 0 };
  const hasNotifications = adminStats.pendingLeaveCount > 0 || adminStats.openComplaintCount > 0 || adminStats.pendingRoomChanges > 0;

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch])
  );

  return (
    <ThemedView style={styles.container}>
      <FloatingBackground primaryColor={Colors.secondary.main} secondaryColor={Colors.primary.main} />
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + 100 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing.lg }]}>
          <View>
            <ThemedText type="bodySmall" secondary style={{ marginBottom: 4 }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</ThemedText>
            <ThemedText type="h1">Dashboard</ThemedText>
          </View>
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <Pressable style={[styles.iconButton, { backgroundColor: theme.backgroundSecondary }]} onPress={() => setShowNotifications(true)}>
              <Feather name="bell" size={20} color={theme.text} />
              {hasNotifications && <View style={styles.badgeDot} />}
            </Pressable>
            <Animated.View style={logoAnimatedStyle}>
              <View style={[styles.iconButton, { backgroundColor: Colors.primary.main }]}>
                <Feather name="shield" size={20} color="#FFFFFF" />
              </View>
            </Animated.View>
          </View>
        </View>

        <View style={{ height: Spacing.md }} />

        <Animated.View entering={FadeInRight.delay(100)} style={{ marginBottom: Spacing.xl }}>
          <FlatList
            ref={flatListRef}
            data={infiniteCarouselData}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm }}
            snapToInterval={width * 0.85 + Spacing.md}
            decelerationRate="fast"
            keyExtractor={(item, index) => index.toString()}
            getItemLayout={(data, index) => ({ length: width * 0.85 + Spacing.md, offset: (width * 0.85 + Spacing.md) * index, index })}
            onMomentumScrollEnd={(ev) => {
              const newIndex = Math.round(ev.nativeEvent.contentOffset.x / (width * 0.85 + Spacing.md));
              setActiveIndex(newIndex);
            }}
            renderItem={({ item, index }) => (
              <Animated.View entering={FadeInRight.delay((index % 3) * 100).springify()}>
                <LinearGradient colors={item.bg as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.carouselCard, { width: width * 0.85 }]}>
                  <View style={[styles.carouselIcon, { backgroundColor: 'rgba(255,255,255,0.2)' }]}><Feather name={item.icon as any} size={24} color="#FFFFFF" /></View>
                  <View><ThemedText type="h3" style={{ color: "#FFFFFF" }}>{item.title}</ThemedText><ThemedText type="caption" style={{ color: "rgba(255,255,255,0.8)" }}>{item.subtitle}</ThemedText></View>
                </LinearGradient>
              </Animated.View>
            )} />
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: Spacing.sm }}>
            {CAROUSEL_ITEMS.map((_, i) => (
              <View key={i} style={{ width: (activeIndex % CAROUSEL_ITEMS.length) === i ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: (activeIndex % CAROUSEL_ITEMS.length) === i ? Colors.secondary.main : theme.textSecondary + '40' }} />
            ))}
          </View>
        </Animated.View>

        <ThemedText type="h3" style={styles.sectionTitle}>Overview</ThemedText>
        <Animated.View entering={FadeInDown.delay(200)} style={styles.statsGrid}>
          <StatCard icon="users" title="Total Students" value={adminStats.studentCount} color={Colors.primary.main} onPress={() => navigation.navigate("StudentManagement")} />
          <StatCard icon="home" title="Vacant Rooms" value={adminStats.vacantRoomsCount || 0} color={Colors.secondary.main} onPress={() => navigation.getParent()?.navigate("ManageTab", { screen: "ManageRooms" })} />
          <StatCard icon="check-circle" title="Present Today" value={adminStats.attendanceCount} color={Colors.status.success} onPress={() => navigation.getParent()?.navigate("AttendanceTab")} />
          <StatCard icon="clock" title="Pending Leaves" value={adminStats.pendingLeaveCount} color={Colors.status.warning} onPress={() => navigation.getParent()?.navigate("ApprovalsTab")} showAlert={adminStats.pendingLeaveCount > 0} />
          <StatCard icon="alert-circle" title="Open Complaints" value={adminStats.openComplaintCount} color={Colors.status.error} onPress={() => navigation.navigate("ComplaintManagement")} showAlert={adminStats.openComplaintCount > 0} />
          <StatCard icon="refresh-cw" title="Room Changes" value={adminStats.pendingRoomChanges || 0} color={Colors.primary.main} onPress={() => navigation.getParent()?.navigate("ApprovalsTab", { screen: "RoomChangeApprovals" })} showAlert={adminStats.pendingRoomChanges > 0} />
        </Animated.View>

        <ThemedText type="h3" style={styles.sectionTitle}>Quick Actions</ThemedText>
        <Animated.View entering={FadeInDown.delay(300)} style={styles.actionsGrid}>
          <Pressable style={[styles.actionCard, { backgroundColor: theme.backgroundSecondary }]} onPress={() => navigation.getParent()?.navigate("ManageTab", { screen: "ManageRooms" })}><View style={[styles.actionIcon, { backgroundColor: Colors.primary.main + '20' }]}><Feather name="home" size={24} color={Colors.primary.main} /></View><ThemedText type="body" style={styles.actionText}>Room Allotment</ThemedText></Pressable>
          <Pressable style={[styles.actionCard, { backgroundColor: theme.backgroundSecondary }]} onPress={() => navigation.getParent()?.navigate("ManageTab", { screen: "ManageMenu" })}><View style={[styles.actionIcon, { backgroundColor: Colors.primary.main + '20' }]}><Feather name="book-open" size={24} color={Colors.primary.main} /></View><ThemedText type="body" style={styles.actionText}>Manage Menu</ThemedText></Pressable>
          <Pressable style={[styles.actionCard, { backgroundColor: theme.backgroundSecondary }]} onPress={() => navigation.getParent()?.navigate("AttendanceTab")}><View style={[styles.actionIcon, { backgroundColor: Colors.status.success + '20' }]}><Feather name="calendar" size={24} color={Colors.status.success} /></View><ThemedText type="body" style={styles.actionText}>Attendance</ThemedText></Pressable>
          <Pressable style={[styles.actionCard, { backgroundColor: theme.backgroundSecondary }]} onPress={() => navigation.getParent()?.navigate("ApprovalsTab")}><View style={[styles.actionIcon, { backgroundColor: Colors.status.warning + '20' }]}><Feather name="clipboard" size={24} color={Colors.status.warning} /></View><ThemedText type="body" style={styles.actionText}>Approvals</ThemedText></Pressable>
          <Pressable style={[styles.actionCard, { backgroundColor: theme.backgroundSecondary }]} onPress={() => navigation.getParent()?.navigate("ManageTab", { screen: "ManageLeaveWindow" })}><View style={[styles.actionIcon, { backgroundColor: Colors.status.warning + '20' }]}><Feather name="navigation" size={24} color={Colors.status.warning} /></View><ThemedText type="body" style={styles.actionText}>Holiday</ThemedText></Pressable>
          <Pressable style={[styles.actionCard, { backgroundColor: theme.backgroundSecondary }]} onPress={() => navigation.getParent()?.navigate("ManageTab", { screen: "ManageAnnouncements" })}><View style={[styles.actionIcon, { backgroundColor: Colors.status.error + '20' }]}><Feather name="volume-2" size={24} color={Colors.status.error} /></View><ThemedText type="body" style={styles.actionText}>Broadcasts</ThemedText></Pressable>
        </Animated.View>
      </ScrollView>

      <Modal visible={showNotifications} animationType="fade" transparent onRequestClose={() => setShowNotifications(false)} accessibilityViewIsModal={true}>
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowNotifications(false)}
          accessibilityRole="button"
          accessibilityLabel="Close notifications"
        >
          <Animated.View entering={FadeInDown.springify()} style={[styles.notificationPopup, { backgroundColor: theme.backgroundSecondary, top: insets.top + 60 }]}>
            <View style={styles.popupHeader}><ThemedText type="h3">Notifications</ThemedText><Pressable onPress={() => setShowNotifications(false)} accessibilityRole="button" accessibilityLabel="Close notifications panel" hitSlop={10} android_ripple={{ color: "rgba(0,0,0,0.08)", borderless: true }}><Feather name="x" size={20} color={theme.text} /></Pressable></View>
            {hasNotifications ? (
              <View style={{ gap: 12 }}>
                {adminStats.pendingLeaveCount > 0 && (<Pressable style={[styles.notifItem, { backgroundColor: Colors.status.warning + '10' }]} onPress={() => { setShowNotifications(false); navigation.getParent()?.navigate("ApprovalsTab"); }}><Feather name="clock" size={20} color={Colors.status.warning} /><View style={{ flex: 1 }}><ThemedText type="bodySmall" style={{ fontWeight: '600' }}>Pending Leave Requests</ThemedText><ThemedText type="caption" secondary>{adminStats.pendingLeaveCount} students waiting for approval</ThemedText></View><Feather name="chevron-right" size={16} color={theme.textSecondary} /></Pressable>)}
                {adminStats.openComplaintCount > 0 && (<Pressable style={[styles.notifItem, { backgroundColor: Colors.status.error + '10' }]} onPress={() => { setShowNotifications(false); navigation.navigate("ComplaintManagement"); }}><Feather name="alert-circle" size={20} color={Colors.status.error} /><View style={{ flex: 1 }}><ThemedText type="bodySmall" style={{ fontWeight: '600' }}>Unresolved Complaints</ThemedText><ThemedText type="caption" secondary>{adminStats.openComplaintCount} complaints need attention</ThemedText></View><Feather name="chevron-right" size={16} color={theme.textSecondary} /></Pressable>)}
                {adminStats.pendingRoomChanges > 0 && (<Pressable style={[styles.notifItem, { backgroundColor: Colors.secondary.main + '10' }]} onPress={() => { setShowNotifications(false); navigation.getParent()?.navigate("ApprovalsTab", { screen: "RoomChangeApprovals" }); }}><Feather name="home" size={20} color={Colors.secondary.main} /><View style={{ flex: 1 }}><ThemedText type="bodySmall" style={{ fontWeight: '600' }}>Room Change Requests</ThemedText><ThemedText type="caption" secondary>{adminStats.pendingRoomChanges} requests waiting for approval</ThemedText></View><Feather name="chevron-right" size={16} color={theme.textSecondary} /></Pressable>)}
              </View>
            ) : (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Feather name="bell-off" size={32} color={theme.textSecondary} />
                <ThemedText type="bodySmall" secondary style={{ marginTop: 8 }}>
                  {isLoading ? "Checking for updates..." : "No new notifications"}
                </ThemedText>
              </View>
            )}
          </Animated.View>
        </Pressable>
      </Modal>
      <LoadingOverlay visible={isLoading} message="Loading admin center..." icon="shield" color={Colors.secondary.main} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.xl },
  iconButton: { padding: 8, borderRadius: BorderRadius.full, justifyContent: 'center', alignItems: 'center', width: 40, height: 40, ...Shadows.card },
  badgeDot: { position: 'absolute', top: 8, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.status.error, borderWidth: 1, borderColor: '#FFF' },
  sectionTitle: { marginBottom: Spacing.md, fontWeight: '700' },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.md, marginBottom: Spacing.xxl },
  statCard: { width: "47%", padding: Spacing.lg, borderRadius: BorderRadius.md, ...Shadows.card },
  statHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  statIcon: { width: 40, height: 40, borderRadius: BorderRadius.sm, justifyContent: "center", alignItems: "center" },
  statValue: { marginBottom: 4 },
  alertBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.md },
  actionCard: { width: "47%", padding: Spacing.lg, borderRadius: BorderRadius.md, alignItems: "center", justifyContent: 'center', ...Shadows.card },
  actionIcon: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.sm },
  actionText: { fontWeight: "600" },
  carouselCard: { height: 140, borderRadius: BorderRadius.md, padding: Spacing.xl, justifyContent: 'space-between', ...Shadows.card },
  carouselIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.sm },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  notificationPopup: { position: 'absolute', right: Spacing.lg, width: width * 0.85, borderRadius: BorderRadius.md, padding: Spacing.md, ...Shadows.modal },
  popupHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.md },
  notifItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: BorderRadius.sm, marginBottom: 8 }
});
