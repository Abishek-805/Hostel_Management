import React, { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { EmptyState } from "@/components/EmptyState";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { BorderRadius, Colors, Shadows, Spacing } from "@/constants/theme";
import { gateApiRequest } from "@/lib/gate-api";
import { useTheme } from "@/hooks/useTheme";

type NotificationItem = {
  _id: string;
  gatePassId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  details?: {
    rejectionReason?: string;
    approvedReturnTime?: string;
    extensionRequestedReturnTime?: string;
    destination?: string;
  };
};

export default function StudentNotificationsScreen() {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await gateApiRequest("GET", "/notifications?limit=50");
      const data = await response.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to load notifications");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void fetchData(false);
    }, [fetchData])
  );

  const markRead = async (id: string) => {
    try {
      await gateApiRequest("PATCH", `/notifications/${id}/read`, {});
      setNotifications((prev) => prev.map((item) => (item._id === id ? { ...item, read: true } : item)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // no-op
    }
  };

  const markAllRead = async () => {
    try {
      await gateApiRequest("PATCH", "/notifications/mark-all-read", {});
      setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
      setUnreadCount(0);
    } catch {
      // no-op
    }
  };

  const renderItem = ({ item, index }: { item: NotificationItem; index: number }) => {
    const accent = item.type.includes("REJECTED") ? Colors.status.error : Colors.status.success;

    return (
      <Animated.View
        entering={FadeInDown.delay(index * 35)}
        style={[
          styles.card,
          {
            backgroundColor: theme.backgroundSecondary,
            borderLeftColor: accent,
            opacity: item.read ? 0.75 : 1,
          },
        ]}
      >
        <View style={styles.rowTop}>
          <View style={[styles.iconWrap, { backgroundColor: `${accent}1F` }]}> 
            <Feather name={item.type.includes("REJECTED") ? "x-circle" : "check-circle"} size={16} color={accent} />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.title}>{item.title}</ThemedText>
            <ThemedText type="caption" secondary>
              {new Date(item.createdAt).toLocaleString()}
            </ThemedText>
          </View>
          {!item.read && <View style={styles.dot} />}
        </View>

        <ThemedText secondary style={styles.message}>{item.message}</ThemedText>

        {item.details?.rejectionReason ? (
          <View style={styles.infoRow}>
            <Feather name="info" size={13} color={Colors.status.error} />
            <ThemedText style={{ color: Colors.status.error, fontSize: 12 }}>
              Reason: {item.details.rejectionReason}
            </ThemedText>
          </View>
        ) : null}

        {item.details?.approvedReturnTime ? (
          <View style={styles.infoRow}>
            <Feather name="clock" size={13} color={theme.textSecondary} />
            <ThemedText style={{ fontSize: 12 }}>
              Return by: {new Date(item.details.approvedReturnTime).toLocaleString()}
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.actions}>
          {!item.read ? (
            <Pressable style={styles.actionBtn} onPress={() => markRead(item._id)}>
              <Feather name="check" size={14} color={Colors.status.success} />
              <ThemedText style={[styles.actionText, { color: Colors.status.success }]}>Mark Read</ThemedText>
            </Pressable>
          ) : (
            <View />
          )}
          <ThemedText type="caption" secondary>Pass: {item.gatePassId}</ThemedText>
        </View>
      </Animated.View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <View>
          <ThemedText type="h2" style={styles.headerTitle}>Gate Alerts</ThemedText>
          <ThemedText type="caption" secondary>
            {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
          </ThemedText>
        </View>

        {unreadCount > 0 ? (
          <Pressable style={styles.markBtn} onPress={markAllRead}>
            <Feather name="check-circle" size={14} color={Colors.primary.main} />
            <ThemedText style={{ color: Colors.primary.main, fontWeight: "700", fontSize: 12 }}>
              Read All
            </ThemedText>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchData(true)} />}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              title="No Gate Notifications"
              subtitle="Approvals, rejections, and extension updates appear here."
              icon="bell-off"
            />
          ) : null
        }
      />

      <LoadingOverlay visible={loading && notifications.length === 0} message="Loading notifications..." />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  headerTitle: {
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  markBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  content: {
    paddingBottom: 100,
    gap: Spacing.md,
  },
  card: {
    borderRadius: BorderRadius.xl,
    borderLeftWidth: 4,
    padding: Spacing.lg,
    ...Shadows.card,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontWeight: "800",
    fontSize: 14,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary.main,
  },
  message: {
    fontSize: 13,
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  actions: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
