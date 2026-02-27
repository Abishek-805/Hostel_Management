import React, { useState, useRef, useEffect } from "react";
import { StyleSheet, View, ScrollView, Pressable, Modal, TextInput, Alert, FlatList, Switch, Animated as RNAnimated } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { apiRequest, getQueryFn } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { FloatingBackground } from "@/components/FloatingBackground";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { EmptyState } from "@/components/EmptyState";
import { TimeAgo } from "@/components/TimeAgo";

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

export default function AnnouncementManagementScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const queryClient = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isEmergency, setIsEmergency] = useState(false);
  const [isHoliday, setIsHoliday] = useState(false);

  const { data: announcements, refetch, isLoading } = useQuery({ queryKey: ['/announcements'], queryFn: getQueryFn({ on401: 'returnNull' }) });

  const createAnnouncementMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/announcements", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/announcements'] });
      setShowModal(false);
      resetForm();
      Alert.alert("Success", "Announcement created!");
    },
    onError: () => Alert.alert("Error", "Failed to create announcement"),
  });

  const resetForm = () => { setTitle(""); setContent(""); setIsEmergency(false); setIsHoliday(false); };

  const handleSubmit = () => {
    if (!title.trim() || !content.trim()) { Alert.alert("Error", "Please fill in all fields"); return; }
    createAnnouncementMutation.mutate({ title: title.trim(), content: content.trim(), isEmergency, isHoliday });
  };

  return (
    <ThemedView style={styles.container}>
      <FloatingBackground primaryColor={Colors.secondary.main} secondaryColor={Colors.primary.main} />
      <FlatList
        data={announcements as any[]}
        keyExtractor={(item) => item.id || item._id}
        removeClippedSubviews
        contentContainerStyle={[styles.listContent, { paddingTop: headerHeight + Spacing.lg, paddingBottom: tabBarHeight + 100 }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <ThemedText type="h3" style={{ marginBottom: Spacing.md }}>All Announcements</ThemedText>
        }
        ListEmptyComponent={() => (
          <Animated.View entering={FadeInDown.delay(200)}>
            <EmptyState title="No announcements yet" subtitle="Create your first announcement." icon="bell-off" />
            <Button variant="outline" onPress={() => setShowModal(true)} style={{ marginTop: Spacing.lg }} accessibilityLabel="Create first announcement">Create First One</Button>
          </Animated.View>
        )}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 100).springify()}>
            <View style={[styles.announcementCard, { backgroundColor: theme.backgroundSecondary, borderColor: item.isEmergency ? Colors.status.error + '50' : 'transparent', borderWidth: 1 }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconContainer, { backgroundColor: item.isEmergency ? Colors.status.error + "15" : item.isHoliday ? Colors.status.success + "15" : Colors.primary.light + "15" }]}>
                  <Feather name={item.isEmergency ? "alert-triangle" : item.isHoliday ? "calendar" : "bell"} size={22} color={item.isEmergency ? Colors.status.error : item.isHoliday ? Colors.status.success : Colors.primary.main} />
                </View>

                <View style={styles.headerInfo}>
                  <ThemedText type="body" style={{ fontWeight: '600', fontSize: 16 }}>{item.title}</ThemedText>
                  <ThemedText type="caption" style={{ color: theme.textSecondary, marginTop: 2 }}>
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

              <ThemedText type="body" style={{ color: theme.textSecondary, lineHeight: 22 }}>{item.content}</ThemedText>
            </View>
          </Animated.View>
        )}
      />

      <Pressable
        style={[styles.fab, { backgroundColor: Colors.primary.main }]}
        onPress={() => setShowModal(true)}
        accessibilityRole="button"
        accessibilityLabel="Create announcement"
        hitSlop={8}
        android_ripple={{ color: "rgba(255,255,255,0.2)", borderless: true }}
      >
        <Feather name="plus" size={24} color="#FFFFFF" />
      </Pressable>

      <Modal visible={showModal} animationType="fade" transparent onRequestClose={() => setShowModal(false)} accessibilityViewIsModal={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundRoot }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="h3">New Announcement</ThemedText>
              <Pressable onPress={() => setShowModal(false)} style={styles.closeBtn}>
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>
            <KeyboardAwareScrollViewCompat contentContainerStyle={styles.modalForm}>
              <ThemedText type="bodySmall" style={styles.label}>Headline</ThemedText>
              <TextInput style={[styles.input, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: theme.border, borderWidth: 1 }]} placeholder="e.g. Exam Schedule Released" placeholderTextColor={theme.textSecondary} value={title} onChangeText={setTitle} />

              <ThemedText type="bodySmall" style={styles.label}>Details</ThemedText>
              <TextInput style={[styles.textArea, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: theme.border, borderWidth: 1 }]} placeholder="Enter full announcement details..." placeholderTextColor={theme.textSecondary} value={content} onChangeText={setContent} multiline numberOfLines={5} />

              <View style={styles.switchContainer}>
                <View style={styles.switchRow}>
                  <View style={[styles.iconBox, { backgroundColor: Colors.status.error + '15' }]}><Feather name="alert-triangle" size={18} color={Colors.status.error} /></View>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="body" style={{ fontWeight: '600' }}>Emergency Alert</ThemedText>
                    <ThemedText type="caption" secondary>Sends push notification immediately</ThemedText>
                  </View>
                  <Switch value={isEmergency} onValueChange={setIsEmergency} trackColor={{ true: Colors.status.error }} />
                </View>

                <View style={styles.switchRow}>
                  <View style={[styles.iconBox, { backgroundColor: Colors.status.success + '15' }]}><Feather name="calendar" size={18} color={Colors.status.success} /></View>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="body" style={{ fontWeight: '600' }}>Holiday Notice</ThemedText>
                    <ThemedText type="caption" secondary>Marks calendar event</ThemedText>
                  </View>
                  <Switch value={isHoliday} onValueChange={setIsHoliday} trackColor={{ true: Colors.status.success }} />
                </View>
              </View>

              <Button onPress={handleSubmit} loading={createAnnouncementMutation.isPending} fullWidth style={{ marginTop: Spacing.md }}>Post Announcement</Button>
            </KeyboardAwareScrollViewCompat>
          </View>
        </View>
      </Modal>
      <LoadingOverlay visible={isLoading} message="Fetching announcements..." icon="bell" color={Colors.secondary.main} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingHorizontal: Spacing.lg },
  announcementCard: { padding: Spacing.lg, borderRadius: BorderRadius.md, marginBottom: Spacing.md, ...Shadows.card },
  cardHeader: { flexDirection: "row", marginBottom: Spacing.md, alignItems: 'center' },
  iconContainer: { width: 48, height: 48, borderRadius: BorderRadius.sm, justifyContent: "center", alignItems: "center" },
  headerInfo: { flex: 1, marginLeft: Spacing.md, justifyContent: "center" },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.full },
  dot: { width: 6, height: 6, borderRadius: 3 },
  divider: { height: 1, opacity: 0.5, marginBottom: Spacing.md },
  emptyState: { padding: Spacing.xxl, borderRadius: BorderRadius.md, alignItems: "center", marginTop: Spacing.xl },
  fab: { position: "absolute", right: Spacing.lg, bottom: Spacing.tabBarHeight + Spacing.xl, width: 56, height: 56, borderRadius: 28, justifyContent: "center", alignItems: "center", ...Shadows.fab, elevation: 5 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)", justifyContent: "flex-end" },
  modalContent: { maxHeight: "85%", borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
  closeBtn: { padding: 4, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 20 },
  modalForm: { padding: Spacing.xl, gap: Spacing.lg },
  label: { marginBottom: 6, fontWeight: '600', color: '#6B7280' },
  input: { height: Spacing.inputHeight, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, fontSize: 16 },
  textArea: { height: 140, borderRadius: BorderRadius.sm, padding: Spacing.md, textAlignVertical: "top", fontSize: 16 },
  switchContainer: { gap: Spacing.md, marginTop: Spacing.sm },
  switchRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  iconBox: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
});
