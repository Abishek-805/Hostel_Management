import React, { useRef, useEffect } from "react";
import { StyleSheet, View, FlatList, RefreshControl, Animated as RNAnimated } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown, useSharedValue, withRepeat, withTiming, useAnimatedStyle, Easing } from 'react-native-reanimated';

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { TimeAgo } from "@/components/TimeAgo";
import { getQueryFn } from "@/lib/query-client";
import { FloatingBackground } from "@/components/FloatingBackground";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";

// Blinking Dot for Urgency
const BlinkingDot = ({ color, duration = 1000 }: { color: string, duration?: number }) => {
  const opacity = useRef(new RNAnimated.Value(0.3)).current;

  useEffect(() => {
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(opacity, { toValue: 1, duration: duration, useNativeDriver: false }),
        RNAnimated.timing(opacity, { toValue: 0.3, duration: duration, useNativeDriver: false }),
      ])
    ).start();
  }, []);

  return <RNAnimated.View style={[styles.dot, { backgroundColor: color, opacity }]} />;
};

// Pulsing Icon Container
const PulsingIcon = ({ children, style }: { children: React.ReactNode, style: any }) => {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.05, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
};

export default function AnnouncementsScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const { data: announcements, isLoading, refetch, error } = useQuery({
    queryKey: ['/announcements'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
  });

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <ThemedView style={styles.container}>
      <FloatingBackground primaryColor={Colors.primary.main} secondaryColor={Colors.secondary.main} />
      {error ? (
        <View style={[styles.listContent, { paddingTop: headerHeight + Spacing.lg, paddingBottom: tabBarHeight + 80 }]}>
          <ErrorState title="Unable to load announcements" message="Please try again." onRetry={() => refetch()} />
        </View>
      ) : (
      <FlatList
        data={announcements as any[]}
        keyExtractor={(item) => item.id || item._id}
        removeClippedSubviews
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: headerHeight + Spacing.lg, paddingBottom: tabBarHeight + 80 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary.main} />
        }
        ListEmptyComponent={() => (
          <Animated.View entering={FadeInDown.delay(200)}>
            <EmptyState title="No announcements yet" subtitle="Check back later for updates from hostel admin" icon="bell-off" />
          </Animated.View>
        )}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 100).springify()}>
            <View
              style={[
                styles.announcementCard,
                { backgroundColor: theme.backgroundDefault, borderColor: item.isEmergency ? Colors.status.error + '50' : 'transparent', borderWidth: 1 },
              ]}
            >
              <View style={styles.cardHeader}>
                <PulsingIcon
                  style={[
                    styles.iconContainer,
                    { backgroundColor: item.isEmergency ? Colors.status.error + "15" : item.isHoliday ? Colors.status.success + "15" : Colors.primary.light + "15" },
                  ]}
                >
                  <Feather
                    name={item.isEmergency ? "alert-triangle" : item.isHoliday ? "calendar" : "bell"}
                    size={22}
                    color={item.isEmergency ? Colors.status.error : item.isHoliday ? Colors.status.success : Colors.primary.main}
                  />
                </PulsingIcon>

                <View style={styles.headerInfo}>
                  <View style={styles.titleRow}>
                    <ThemedText type="body" style={styles.title}>{item.title}</ThemedText>
                  </View>
                  <ThemedText type="caption" secondary>
                    <TimeAgo date={item.createdAt} />
                  </ThemedText>
                </View>

                {item.isEmergency && (
                  <View style={[styles.statusBadge, { backgroundColor: Colors.status.error + '20' }]}>
                    <BlinkingDot color={Colors.status.error} duration={500} />
                    <ThemedText type="caption" style={{ color: Colors.status.error, fontWeight: '700' }}>URGENT</ThemedText>
                  </View>
                )}
                {item.isHoliday && (
                  <View style={[styles.statusBadge, { backgroundColor: Colors.status.success + '20' }]}>
                    <ThemedText type="caption" style={{ color: Colors.status.success, fontWeight: '700' }}>HOLIDAY</ThemedText>
                  </View>
                )}
              </View>

              <View style={[styles.divider, { backgroundColor: theme.border }]} />

              <ThemedText type="body" style={[styles.content, { color: theme.textSecondary }]}>{item.content}</ThemedText>
            </View>
          </Animated.View>
        )}
      />)}
      <LoadingOverlay visible={isLoading} message="Fetching announcements..." icon="bell" />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
  },
  announcementCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    ...Shadows.card,
  },
  cardHeader: {
    flexDirection: "row",
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  headerInfo: {
    flex: 1,
    marginLeft: Spacing.md,
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: 2,
  },
  title: {
    fontWeight: "600",
    fontSize: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  divider: {
    height: 1,
    opacity: 0.5,
    marginBottom: Spacing.md,
  },
  content: {
    lineHeight: 22,
  },
  emptyState: {
    padding: Spacing.xxl,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    marginTop: Spacing.xl,
  },
  emptyText: {
    marginTop: Spacing.md,
  },
  emptySubtext: {
    marginTop: Spacing.xs,
    textAlign: "center",
  },
});
