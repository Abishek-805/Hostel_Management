import React, { useRef, useState, useEffect } from "react";
import { StyleSheet, View, ScrollView, Pressable, RefreshControl, Modal, FlatList, Dimensions, Animated as RNAnimated, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  FadeInRight,
  useSharedValue,
  withRepeat,
  withTiming,
  useAnimatedStyle,
  Easing,
  withDelay
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { FloatingBackground } from "@/components/FloatingBackground";
import { LoadingOverlay } from "@/components/LoadingOverlay";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { getQueryFn } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { StudentStackParamList } from "@/navigation/StudentTabNavigator";

type NavigationProp = NativeStackNavigationProp<StudentStackParamList>;
const { width } = Dimensions.get('window');

// Blinking Dot Component (reused for consistency)
const BlinkingDot = ({ color }: { color: string }) => {
  const opacity = useRef(new RNAnimated.Value(0.3)).current;

  useEffect(() => {
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: Platform.OS !== 'web' }),
        RNAnimated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: Platform.OS !== 'web' }),
      ])
    ).start();
  }, []);

  return <RNAnimated.View style={[styles.dot, { backgroundColor: color, opacity }]} />;
};



interface DashboardCardProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
  count?: string | number;
  color: string;
  onPress: () => void;
  showAlert?: boolean;
}

function DashboardCard({ icon, title, subtitle, count, color, onPress, showAlert }: DashboardCardProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      style={[styles.statCard, { backgroundColor: theme.backgroundSecondary }]}
      onPress={onPress}
    >
      <View style={styles.statHeader}>
        <View style={[styles.statIcon, { backgroundColor: color + "15" }]}>
          <Feather name={icon} size={22} color={color} />
        </View>
        {showAlert && (
          <View style={[styles.alertBadge, { backgroundColor: color + '20' }]}>
            <BlinkingDot color={color} />
            <ThemedText type="caption" style={{ color: color, fontWeight: '700', fontSize: 10 }}>ACTION</ThemedText>
          </View>
        )}
      </View>
      {count ? <ThemedText type="h1" style={[styles.statValue, { color }]}>{count}</ThemedText> : null}
      <ThemedText type="h3" style={[styles.cardTitle, !count && { marginTop: 8 }]}>{title}</ThemedText>
      <ThemedText type="caption" style={{ color: theme.textSecondary }}>{subtitle}</ThemedText>
    </Pressable>
  );
}

interface AttendanceCheckResponse {
  marked?: boolean;
}

export default function StudentDashboardScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const { theme } = useTheme();

  // Queries
  const today = new Date().toISOString().split('T')[0];
  const { data: attendanceData, refetch: refetchAttendance } = useQuery<AttendanceCheckResponse>({
    queryKey: ['/attendances/check', user?.id, today],
    enabled: !!user?.id,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const { data: leaveRequests, refetch: refetchLeaves } = useQuery({
    queryKey: ['leave-requests', 'user', user?.id],
    enabled: !!user?.id,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const { data: complaints, refetch: refetchComplaints } = useQuery({
    queryKey: ['/complaints/user', user?.id],
    enabled: !!user?.id,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const { data: announcements, refetch: refetchAnnouncements } = useQuery({
    queryKey: ['/announcements'],
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['/stats/admin'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: user?.role === 'admin',
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

  const activeSession = hostelSettings as any;

  const isLoading = !attendanceData && !leaveRequests && !complaints && !announcements;

  const logoScale = useSharedValue(1);

  useEffect(() => {
    logoScale.value = withRepeat(
      withTiming(1.08, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
  }));

  const [refreshing, setRefreshing] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  const refetchDashboardData = React.useCallback(async () => {
    await Promise.all([
      refetchAttendance(),
      refetchLeaves(),
      refetchComplaints(),
      refetchAnnouncements(),
      user?.role === 'admin' ? refetchStats() : Promise.resolve(),
    ]);
  }, [refetchAttendance, refetchLeaves, refetchComplaints, refetchAnnouncements, refetchStats, user?.role]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetchDashboardData();
    setRefreshing(false);
  };

  useFocusEffect(
    React.useCallback(() => {
      refetchDashboardData();
    }, [refetchDashboardData])
  );

  // Status Logic
  const isAttendanceMarked = !!attendanceData?.marked;
  const pendingLeaves = (leaveRequests as any[])?.filter((r: any) => r.status === "pending").length || 0;
  const openComplaints = (complaints as any[])?.filter((c: any) => c.status !== "resolved").length || 0;

  useEffect(() => {
    checkUnreadStatus();
  }, [announcements]);

  const checkUnreadStatus = async () => {
    if (!announcements) return;
    try {
      const lastSeenCount = await AsyncStorage.getItem(`@last_seen_announcements_${user?.id}`);
      const currentCount = (announcements as any[]).length;
      if (!lastSeenCount || parseInt(lastSeenCount) < currentCount) {
        setHasUnread(true);
      } else {
        setHasUnread(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleNotificationPress = async () => {
    if (announcements) {
      await AsyncStorage.setItem(`@last_seen_announcements_${user?.id}`, (announcements as any[]).length.toString());
      setHasUnread(false);
    }
    navigation.navigate("Announcements");
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };

  return (
    <ThemedView style={styles.container}>
      <FloatingBackground primaryColor={Colors.primary.main} secondaryColor={Colors.secondary.main} />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + Spacing.xl, paddingBottom: tabBarHeight + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary.main} />
        }
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.header}>
          <View>
            <ThemedText type="bodySmall" secondary>{getGreeting()}</ThemedText>
            <ThemedText type="h2" style={{ marginTop: 4 }}>{user?.name || "Student"}</ThemedText>
          </View>

          <View style={{ flexDirection: 'row', gap: Spacing.md }}>
            <Pressable
              style={[styles.iconButton, { backgroundColor: theme.backgroundSecondary }]}
              onPress={handleNotificationPress}
            >
              <Feather name="bell" size={20} color={hasUnread ? theme.text : theme.textSecondary} />
              {hasUnread && <View style={styles.badgeDot} />}
            </Pressable>

            <Animated.View style={[styles.roleBadge, { backgroundColor: Colors.primary.light + '20' }, logoAnimatedStyle]}>
              <Feather name="user" size={16} color={Colors.primary.main} />
              <ThemedText type="caption" style={{ color: Colors.primary.main, fontWeight: '600' }}>STUDENT</ThemedText>
            </Animated.View>
          </View>
        </Animated.View>

        {/* Active Leave Session Banner */}
        {activeSession?.leaveWindowLabel &&
          activeSession?.leaveWindowTo &&
          new Date(activeSession.leaveWindowTo).setHours(23, 59, 59, 999) >= Date.now() ? (
          <Animated.View entering={FadeInDown.delay(120)}>
            <View style={[styles.leaveBanner, { backgroundColor: Colors.status.warning + '15', borderColor: Colors.status.warning + '40' }]}>
              <View style={styles.leaveBannerIcon}>
                <Feather name="info" size={20} color={Colors.status.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText type="bodySmall" style={{ fontWeight: '700', color: Colors.status.warning }}>
                  Holiday: {activeSession.leaveWindowLabel}
                </ThemedText>
                <ThemedText type="caption" secondary>
                  From {new Date(activeSession.leaveWindowFrom).toLocaleDateString()} to {new Date(activeSession.leaveWindowTo).toLocaleDateString()}
                </ThemedText>
              </View>
              <Pressable onPress={() => navigation.getParent()?.navigate("AttendanceTab")}>
                <Feather name="arrow-right" size={20} color={Colors.status.warning} />
              </Pressable>
            </View>
          </Animated.View>
        ) : null}

        {/* Room Info Card - Styled like a banner */}
        {user?.roomNumber && user?.hostelBlock ? (
          <Animated.View entering={FadeInDown.delay(150)}>
            <Pressable
              onPress={() => navigation.navigate("RoomDetails")}
            >
              <LinearGradient
                colors={[Colors.primary.main, Colors.primary.pressed]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.roomBanner}
              >
                <View style={styles.roomIconContainer}>
                  <Feather name="home" size={24} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText type="h3" style={{ color: "#FFF" }}>Block {user.hostelBlock}</ThemedText>
                  <ThemedText type="bodySmall" style={{ color: "rgba(255,255,255,0.8)" }}>Room {user.roomNumber}</ThemedText>
                </View>
                <Feather name="chevron-right" size={24} color="#FFF" />
              </LinearGradient>
            </Pressable>
          </Animated.View>
        ) : null}

        <ThemedText type="h3" style={styles.sectionTitle}>Overview</ThemedText>

        <Animated.View entering={FadeInDown.delay(200)} style={styles.statsGrid}>
          <DashboardCard
            icon="book-open"
            title="Mess Menu"
            subtitle="View today's menu"
            color={Colors.primary.main}
            onPress={() => navigation.getParent()?.navigate("MenuTab")}
          />
          <DashboardCard
            icon="check-circle"
            title="Attendance"
            subtitle={isAttendanceMarked ? "Marked for today" : "Not marked yet"}
            color={isAttendanceMarked ? Colors.status.success : Colors.status.warning}
            count={isAttendanceMarked ? "Present" : "Pending"}
            onPress={() => navigation.getParent()?.navigate("AttendanceTab")}
            showAlert={!isAttendanceMarked}
          />
          <DashboardCard
            icon="file-text"
            title="Leave Requests"
            subtitle={pendingLeaves > 0 ? "Awaiting approval" : "Apply for leave"}
            color={pendingLeaves > 0 ? Colors.status.warning : Colors.status.info}
            count={pendingLeaves > 0 ? pendingLeaves : undefined}
            onPress={() => navigation.getParent()?.navigate("RequestsTab")}
            showAlert={pendingLeaves > 0}
          />
          <DashboardCard
            icon="alert-circle"
            title="Complaints"
            subtitle={openComplaints > 0 ? "Open tickets" : "Report an issue"}
            color={openComplaints > 0 ? Colors.status.error : Colors.status.success}
            count={openComplaints > 0 ? openComplaints : undefined}
            onPress={() => navigation.navigate("Complaints")}
            showAlert={openComplaints > 0}
          />
        </Animated.View>

        <ThemedText type="h3" style={styles.sectionTitle}>Recent Announcements</ThemedText>

        <Animated.View entering={FadeInDown.delay(300)}>
          {
            (announcements as any[])?.length > 0 ? (
              (announcements as any[]).slice(0, 3).map((announcement: any, index: number) => (
                <Animated.View key={announcement.id || announcement._id} entering={FadeInRight.delay(index * 100)}>
                  <Pressable
                    style={[
                      styles.announcementCard,
                      { backgroundColor: theme.backgroundSecondary },
                      announcement.isEmergency && styles.emergencyCard,
                    ]}
                    onPress={() => {
                      // If it's a poll announcement, navigate to Food Poll instead
                      if (announcement.pollId) {
                        navigation.navigate("MenuTab", { screen: "Menu", params: { initial: false } } as any);
                        // Then navigate to FoodPoll within the MenuTab stack
                        setTimeout(() => {
                          navigation.navigate("MenuTab", { screen: "FoodPoll" } as any);
                        }, 100);
                      } else {
                        navigation.navigate("Announcements");
                      }
                    }}
                  >
                    <View style={styles.announcementHeader}>
                      <View style={[styles.announcementIcon, {
                        backgroundColor: announcement.isEmergency ? Colors.status.error + '15' : Colors.primary.light + '15'
                      }]}>
                        <Feather
                          name={announcement.isEmergency ? "alert-triangle" : announcement.pollId ? "bar-chart-2" : "bell"}
                          size={20}
                          color={announcement.isEmergency ? Colors.status.error : announcement.pollId ? Colors.status.success : Colors.primary.main}
                        />
                      </View>
                      <ThemedText type="body" style={styles.announcementTitle} numberOfLines={1}>
                        {announcement.title}
                      </ThemedText>
                      <Feather name="chevron-right" size={16} color={theme.textSecondary} />
                    </View>
                    <ThemedText type="bodySmall" secondary numberOfLines={2}>
                      {announcement.content}
                    </ThemedText>
                  </Pressable>
                </Animated.View>
              ))
            ) : (
              <View style={[styles.emptyState, { backgroundColor: theme.backgroundSecondary }]}>
                <Feather name="inbox" size={32} color={theme.textSecondary} />
                <ThemedText type="body" secondary style={styles.emptyText}>
                  No announcements yet
                </ThemedText>
              </View>
            )
          }
        </Animated.View>
      </ScrollView>
      <LoadingOverlay visible={isLoading} message="Fetching your dashboard..." icon="home" />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.xl },
  roleBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: BorderRadius.full },
  iconButton: { padding: 8, borderRadius: BorderRadius.full, justifyContent: 'center', alignItems: 'center', width: 40, height: 40, ...Shadows.card },
  badgeDot: { position: 'absolute', top: 8, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.status.error, borderWidth: 1, borderColor: '#FFF' },
  sectionTitle: { marginBottom: Spacing.md, fontWeight: '700', marginTop: Spacing.lg },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.md },
  statCard: { width: "47%", padding: Spacing.lg, borderRadius: BorderRadius.md, ...Shadows.card, marginBottom: Spacing.md, justifyContent: 'space-between' },
  statHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  statIcon: { width: 40, height: 40, borderRadius: BorderRadius.sm, justifyContent: "center", alignItems: "center" },
  statValue: { marginBottom: 4 },
  cardTitle: { marginBottom: 4, fontSize: 16, fontWeight: '600' },
  alertBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12 },
  dot: { width: 6, height: 6, borderRadius: 3 },

  roomBanner: { flexDirection: 'row', alignItems: 'center', padding: Spacing.lg, borderRadius: BorderRadius.md, marginBottom: Spacing.md, ...Shadows.card, gap: Spacing.md },
  roomIconContainer: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },

  announcementCard: { padding: Spacing.lg, borderRadius: BorderRadius.md, marginBottom: Spacing.md, ...Shadows.card },
  emergencyCard: { borderLeftWidth: 4, borderLeftColor: Colors.status.error },
  announcementHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.sm },
  announcementIcon: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  announcementTitle: { fontWeight: "600", flex: 1 },
  emptyState: { padding: Spacing.xxl, borderRadius: BorderRadius.md, alignItems: "center", justifyContent: "center" },
  emptyText: { marginTop: Spacing.md },
  loadingOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  loadingCircle: {
    backgroundColor: '#FFFFFF',
    padding: 30,
    borderRadius: 24,
    alignItems: 'center',
    ...Shadows.modal,
    gap: 10,
  },
  leaveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    gap: Spacing.md,
    ...Shadows.card,
  },
  leaveBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
