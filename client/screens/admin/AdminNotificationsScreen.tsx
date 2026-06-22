import React, { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { BorderRadius, Colors, Shadows, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { gateApiRequest } from "@/lib/gate-api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "@/config/api";

type NotificationItem = {
  _id: string;
  gatePassId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  details: {
    studentName?: string;
    registerId?: string;
    hostelBlock?: string;
    roomNumber?: string;
    exitTime?: string;
    entryTime?: string;
    expectedReturnTime?: string;
    lateDurationMinutes?: number;
    destination?: string;
  };
  studentId?: {
    _id: string;
    name: string;
    registerId: string;
    hostelBlock?: string;
    roomNumber?: string;
  };
};

type TabKey = "all" | "late" | "unread";

const TABS: { key: TabKey; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: "all", label: "All", icon: "bell" },
  { key: "late", label: "Late", icon: "alert-triangle" },
  { key: "unread", label: "Unread", icon: "eye-off" },
];

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString();
}

export default function AdminNotificationsScreen() {
  const { theme, isDark } = useTheme();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(
    async (pageNum = 1, isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const token = await AsyncStorage.getItem("@hostelease_token");
        const params = new URLSearchParams({
          page: String(pageNum),
          limit: "20",
        });

        if (activeTab === "late") params.append("type", "LATE_RETURN");
        if (activeTab === "unread") params.append("unreadOnly", "true");

        const resp = await fetch(
          `${API_BASE_URL}/api/notifications?${params.toString()}`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }
        );

        if (!resp.ok) throw new Error("Failed to fetch notifications");

        const data = await resp.json();
        setNotifications(
          pageNum === 1
            ? data.notifications
            : [...notifications, ...data.notifications]
        );
        setPage(data.pagination.page);
        setTotalPages(data.pagination.totalPages);
        setUnreadCount(data.unreadCount ?? 0);
      } catch (error: any) {
        Alert.alert("Error", error.message || "Could not load notifications");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeTab, notifications]
  );

  useFocusEffect(
    useCallback(() => {
      void fetchNotifications(1, false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab])
  );

  const markAsRead = async (id: string) => {
    try {
      const token = await AsyncStorage.getItem("@hostelease_token");
      await fetch(`${API_BASE_URL}/api/notifications/${id}/read`, {
        method: "PATCH",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch { }
  };

  const markAllRead = async () => {
    try {
      const token = await AsyncStorage.getItem("@hostelease_token");
      await fetch(`${API_BASE_URL}/api/notifications/mark-all-read`, {
        method: "PATCH",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch { }
  };

  const deleteNotification = async (id: string) => {
    try {
      const token = await AsyncStorage.getItem("@hostelease_token");
      await fetch(`${API_BASE_URL}/api/notifications/${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setNotifications((prev) => prev.filter((n) => n._id !== id));
    } catch { }
  };

  const loadMore = () => {
    if (page < totalPages && !loading) {
      void fetchNotifications(page + 1, false);
    }
  };

  const renderNotification = ({
    item,
    index,
  }: {
    item: NotificationItem;
    index: number;
  }) => {
    const isLate = item.type === "LATE_RETURN";
    const details = item.details || {};
    const accentColor = isLate ? Colors.status.error : Colors.status.info;

    return (
      <Animated.View
        entering={FadeInDown.delay(index * 40)}
        style={[
          styles.card,
          {
            backgroundColor: theme.backgroundSecondary,
            borderLeftColor: accentColor,
            opacity: item.read ? 0.75 : 1,
          },
        ]}
      >
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={[styles.iconCircle, { backgroundColor: accentColor + "15" }]}>
            <Feather
              name={isLate ? "alert-triangle" : "bell"}
              size={18}
              color={accentColor}
            />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.cardTitle}>{item.title}</ThemedText>
            <ThemedText type="caption" secondary>
              {formatTime(item.createdAt)}
            </ThemedText>
          </View>
          {!item.read && <View style={styles.unreadDot} />}
        </View>

        {/* Details grid */}
        {isLate && (
          <View style={styles.detailsGrid}>
            <DetailRow
              icon="user"
              label="Student"
              value={details.studentName || "—"}
              theme={theme}
            />
            <DetailRow
              icon="hash"
              label="Register ID"
              value={details.registerId || "—"}
              theme={theme}
            />
            <DetailRow
              icon="tag"
              label="Gate Pass"
              value={item.gatePassId}
              theme={theme}
            />
            <DetailRow
              icon="home"
              label="Block / Room"
              value={`${details.hostelBlock || "—"} / ${details.roomNumber || "—"}`}
              theme={theme}
            />
            <DetailRow
              icon="map-pin"
              label="Destination"
              value={details.destination || "—"}
              theme={theme}
            />
            <DetailRow
              icon="log-out"
              label="Exit Time"
              value={formatTime(details.exitTime)}
              theme={theme}
            />
            <DetailRow
              icon="log-in"
              label="Entry Time"
              value={formatTime(details.entryTime)}
              theme={theme}
            />
            <DetailRow
              icon="clock"
              label="Expected Return"
              value={formatTime(details.expectedReturnTime)}
              theme={theme}
            />
            <View style={styles.lateRow}>
              <Feather name="alert-circle" size={14} color={Colors.status.error} />
              <ThemedText style={[styles.lateText, { color: Colors.status.error }]}>
                Late by {formatDuration(details.lateDurationMinutes || 0)}
              </ThemedText>
            </View>
          </View>
        )}

        {!isLate && (
          <ThemedText secondary style={styles.msgText}>
            {item.message}
          </ThemedText>
        )}

        {/* Actions */}
        <View style={styles.cardActions}>
          {!item.read && (
            <Pressable
              style={styles.actionBtn}
              onPress={() => markAsRead(item._id)}
            >
              <Feather name="check" size={14} color={Colors.status.success} />
              <ThemedText
                style={[styles.actionText, { color: Colors.status.success }]}
              >
                Read
              </ThemedText>
            </Pressable>
          )}
          <Pressable
            style={styles.actionBtn}
            onPress={() =>
              Alert.alert("Delete", "Remove this notification?", [
                { text: "Cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () => deleteNotification(item._id),
                },
              ])
            }
          >
            <Feather name="trash-2" size={14} color={Colors.status.error} />
            <ThemedText
              style={[styles.actionText, { color: Colors.status.error }]}
            >
              Delete
            </ThemedText>
          </Pressable>
        </View>
      </Animated.View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <LinearGradient
        colors={isDark ? ["#111827", "#1f2937"] : ["#f9fafb", "#f3f4f6"]}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <ThemedText type="h2" style={styles.headerTitle}>
            Notifications
          </ThemedText>
          <ThemedText type="caption" secondary>
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
              : "All caught up"}
          </ThemedText>
        </View>
        {unreadCount > 0 && (
          <Pressable style={styles.markAllBtn} onPress={markAllRead}>
            <Feather name="check-circle" size={16} color={Colors.primary.main} />
            <ThemedText
              style={[styles.markAllText, { color: Colors.primary.main }]}
            >
              Mark all read
            </ThemedText>
          </Pressable>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <Pressable
            key={tab.key}
            style={[
              styles.tabBtn,
              activeTab === tab.key && styles.tabBtnActive,
            ]}
            onPress={() => {
              setActiveTab(tab.key);
              setPage(1);
            }}
          >
            <Feather
              name={tab.icon}
              size={16}
              color={activeTab === tab.key ? "#fff" : theme.textSecondary}
            />
            <ThemedText
              style={[
                styles.tabLabel,
                activeTab === tab.key && { color: "#fff", fontWeight: "700" },
              ]}
            >
              {tab.label}
              {tab.key === "unread" && unreadCount > 0 ? ` (${unreadCount})` : ""}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={notifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchNotifications(1, true)}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              title="No Notifications"
              subtitle={
                activeTab === "late"
                  ? "No late return alerts at this time."
                  : "You're all caught up!"
              }
              icon="bell-off"
            />
          ) : null
        }
      />

      <LoadingOverlay visible={loading && notifications.length === 0} message="Loading..." />
    </ThemedView>
  );
}

function DetailRow({
  icon,
  label,
  value,
  theme,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  theme: any;
}) {
  return (
    <View style={styles.detailRow}>
      <Feather name={icon} size={13} color={theme.textSecondary} />
      <ThemedText type="caption" secondary style={styles.detailLabel}>
        {label}:
      </ThemedText>
      <ThemedText style={styles.detailValue}>{value}</ThemedText>
    </View>
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
    letterSpacing: -1,
  },
  markAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  markAllText: {
    fontSize: 12,
    fontWeight: "700",
  },
  tabBar: {
    flexDirection: "row",
    borderRadius: BorderRadius.lg,
    backgroundColor: "rgba(0,0,0,0.05)",
    padding: 4,
    marginBottom: Spacing.lg,
  },
  tabBtn: {
    flex: 1,
    height: 40,
    borderRadius: BorderRadius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: Colors.primary.main,
    ...Shadows.sm,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  listContent: {
    paddingBottom: 120,
    gap: Spacing.md,
  },
  card: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderLeftWidth: 4,
    ...Shadows.card,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  cardTitle: {
    fontWeight: "800",
    fontSize: 14,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary.main,
  },
  detailsGrid: {
    gap: 6,
    marginBottom: 12,
    padding: 12,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailLabel: {
    width: 100,
    fontWeight: "600",
  },
  detailValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  lateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  lateText: {
    fontSize: 14,
    fontWeight: "900",
  },
  msgText: {
    fontSize: 13,
    marginBottom: 12,
  },
  cardActions: {
    flexDirection: "row",
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
    paddingTop: 12,
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
