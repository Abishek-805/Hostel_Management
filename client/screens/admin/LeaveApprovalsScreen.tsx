import React, { useState, useRef, useEffect } from "react";
import { StyleSheet, View, ScrollView, Pressable, Modal, TextInput, Alert, FlatList, Image, Animated as RNAnimated, Easing, Platform, Linking } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";

import Animated, { FadeInDown, FadeInRight, useSharedValue, withRepeat, withTiming, useAnimatedStyle, Easing as ReanimatedEasing } from 'react-native-reanimated';
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { apiRequest, getQueryFn } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { FloatingBackground } from "@/components/FloatingBackground";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { EmptyState } from "@/components/EmptyState";

type FilterTab = "all" | "pending" | "approved" | "rejected";

const STATUS_COLORS = { pending: Colors.status.warning, approved: Colors.status.success, rejected: Colors.status.error };

const BlinkingDot = ({ color, duration = 1000 }: { color: string, duration?: number }) => {
  const opacity = useRef(new RNAnimated.Value(0.3)).current;

  useEffect(() => {
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(opacity, { toValue: 1, duration: duration, useNativeDriver: Platform.OS !== 'web' }),
        RNAnimated.timing(opacity, { toValue: 0.3, duration: duration, useNativeDriver: Platform.OS !== 'web' }),
      ])
    ).start();
  }, []);

  return <RNAnimated.View style={[styles.dot, { backgroundColor: color, opacity }]} />;
};

const PulsingEmergencyCard = ({ children, style, onPress }: { children: React.ReactNode, style?: any, onPress?: () => void }) => {
  const scale = useRef(new RNAnimated.Value(1)).current;

  useEffect(() => {
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(scale, { toValue: 1.02, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
        RNAnimated.timing(scale, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
      ])
    ).start();
  }, []);

  return (
    <RNAnimated.View style={[style, { transform: [{ scale }] }]}>
      <Pressable onPress={onPress}>
        {children}
      </Pressable>
    </RNAnimated.View>
  );
};

export default function LeaveApprovalsScreen() {

  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<FilterTab>("pending");
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [adminRemarks, setAdminRemarks] = useState("");

  const { data: requests, isLoading } = useQuery({ queryKey: ['/leave-requests'], queryFn: getQueryFn({ on401: 'returnNull' }) });

  const updateRequestMutation = useMutation({
    mutationFn: async ({ id, status, remarks }: { id: string; status: string; remarks?: string }) => {
      const response = await apiRequest("PATCH", `/leave-requests/${id}/status`, { status, adminRemarks: remarks });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/stats/admin'] });
      setShowModal(false);
      setSelectedRequest(null);
      setAdminRemarks("");
      Alert.alert("Success", "Leave request updated!");
    },
    onError: () => Alert.alert("Error", "Failed to update request"),
  });

  const filteredRequests = React.useMemo(() => {
    const all = Array.isArray(requests) ? requests : [];
    if (all.length === 0) return [];
    if (activeTab === "all") return all;
    return all.filter((r: any) => r.status === activeTab);
  }, [requests, activeTab]);

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const handleAction = (status: "approved" | "rejected") => {
    if (!selectedRequest) return;
    updateRequestMutation.mutate({ id: selectedRequest._id, status, remarks: adminRemarks });
  };

  const tabs: FilterTab[] = ["pending", "all", "approved", "rejected"];

  const summaryStats = React.useMemo(() => {
    const all = (requests as any[]) || [];
    return {
      pending: all.filter(r => r.status === 'pending').length,
      approved: all.filter(r => r.status === 'approved').length,
      rejected: all.filter(r => r.status === 'rejected').length,
    };
  }, [requests]);

  return (
    <ThemedView style={styles.container}>
      <FloatingBackground primaryColor={Colors.secondary.main} secondaryColor={Colors.primary.main} />
      {/* Header Stats & Tabs */}
      <View style={[styles.headerSection, { paddingTop: headerHeight, backgroundColor: theme.backgroundDefault }]}>
        <View style={styles.statsRow}>
          <View style={[styles.statBadge, { backgroundColor: Colors.status.warning + '15', borderColor: Colors.status.warning + '30' }]}>
            <BlinkingDot color={Colors.status.warning} duration={800} />
            <ThemedText type="caption" style={{ color: Colors.status.warning, fontWeight: '700' }}>{summaryStats.pending} Pending</ThemedText>
          </View>
          <View style={[styles.statBadge, { backgroundColor: Colors.status.success + '15', borderColor: Colors.status.success + '30' }]}>
            <BlinkingDot color={Colors.status.success} duration={1500} />
            <ThemedText type="caption" style={{ color: Colors.status.success, fontWeight: '700' }}>{summaryStats.approved} Approved</ThemedText>
          </View>
          <View style={[styles.statBadge, { backgroundColor: Colors.status.error + '15', borderColor: Colors.status.error + '30' }]}>
            <BlinkingDot color={Colors.status.error} duration={2000} />
            <ThemedText type="caption" style={{ color: Colors.status.error, fontWeight: '700' }}>{summaryStats.rejected} Rejected</ThemedText>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          {tabs.map((tab) => (
            <Pressable
              key={tab}
              style={[
                styles.tab,
                {
                  backgroundColor: activeTab === tab ? Colors.primary.main : 'transparent',
                  borderColor: activeTab === tab ? Colors.primary.main : theme.border
                }
              ]}
              onPress={() => setActiveTab(tab)}
            >
              <ThemedText type="bodySmall" style={{ color: activeTab === tab ? "#FFFFFF" : theme.textSecondary, fontWeight: "600" }}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filteredRequests}
        keyExtractor={(item) => item._id}
        removeClippedSubviews
        contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + 100 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={() => (
          <EmptyState title="No requests found" subtitle="New leave requests will appear here." icon="inbox" />
        )}
        renderItem={({ item }) => {
          const studentName = typeof item.userId === 'object' ? item.userId.name : item.userId;
          const studentId = typeof item.userId === 'object' ? item.userId.registerId : 'Unknown ID';

          const CardContent = (
            <>
              <View style={styles.cardHeader}>
                <View style={styles.userInfo}>
                  <View style={[styles.avatar, { backgroundColor: item.isEmergency ? Colors.status.error + '20' : Colors.primary.light + '20' }]}>
                    <ThemedText style={{ fontWeight: 'bold', color: item.isEmergency ? Colors.status.error : Colors.primary.main }}>
                      {studentName.charAt(0)}
                    </ThemedText>
                  </View>
                  <View>
                    <ThemedText type="body" style={{ fontWeight: '600' }}>{studentName}</ThemedText>
                    <ThemedText type="caption" secondary>{studentId}</ThemedText>
                  </View>
                </View>
                <View style={[styles.statusChip, { backgroundColor: STATUS_COLORS[item.status as keyof typeof STATUS_COLORS] + '20' }]}>
                  <ThemedText type="caption" style={{ color: STATUS_COLORS[item.status as keyof typeof STATUS_COLORS], fontWeight: '700', fontSize: 10 }}>
                    {item.status.toUpperCase()}
                  </ThemedText>
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: theme.border }]} />

              <View style={styles.cardBody}>
                <View style={styles.dateRow}>
                  <Feather name="calendar" size={14} color={theme.textSecondary} />
                  <ThemedText type="bodySmall" style={{ fontWeight: '500' }}>{formatDate(item.fromDate)} - {formatDate(item.toDate)}</ThemedText>
                </View>
                <ThemedText type="bodySmall" secondary numberOfLines={2} style={styles.reasonText}>
                  {item.reason}
                </ThemedText>

                {!!item.isEmergency && (
                  <View style={styles.emergencyTag}>
                    <Feather name="alert-triangle" size={12} color={Colors.status.error} />
                    <ThemedText type="caption" style={{ color: Colors.status.error, fontWeight: 'bold' }}>Emergency</ThemedText>
                    <BlinkingDot color={Colors.status.error} duration={400} />
                  </View>
                )}
              </View>
            </>
          );

          if (item.isEmergency) {
            return (
              <PulsingEmergencyCard
                style={[styles.requestCard, { backgroundColor: theme.backgroundDefault, borderColor: Colors.status.error + '40', borderWidth: 1 }]}
                onPress={() => { setSelectedRequest(item); setShowModal(true); }}
              >
                {CardContent}
              </PulsingEmergencyCard>
            );
          }

          return (
            <Pressable
              style={({ pressed }) => [
                styles.requestCard,
                { backgroundColor: theme.backgroundDefault, transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
              onPress={() => { setSelectedRequest(item); setShowModal(true); }}
            >
              {CardContent}
            </Pressable>
          );
        }}
      />

      <Modal visible={showModal} animationType="fade" transparent onRequestClose={() => setShowModal(false)} accessibilityViewIsModal={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundRoot }]}>
            <View style={styles.modalHeader}>
              <View>
                <ThemedText type="h3">Review Request</ThemedText>
                <ThemedText type="caption" secondary>Review student leave application</ThemedText>
              </View>
              <Pressable onPress={() => setShowModal(false)} style={styles.closeBtn}>
                <Feather name="x" size={20} color={theme.text} />
              </Pressable>
            </View>

            {selectedRequest && (
              <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
                <View style={[styles.infoCard, { backgroundColor: theme.backgroundSecondary }]}>
                  <View style={styles.detailRow}>
                    <View style={styles.iconBox}><Feather name="user" size={16} color={Colors.primary.main} /></View>
                    <View>
                      <ThemedText type="caption" secondary>Student</ThemedText>
                      <ThemedText type="body" style={{ fontWeight: '600' }}>
                        {typeof selectedRequest.userId === 'object' ? `${selectedRequest.userId.name}` : selectedRequest.userId}
                      </ThemedText>
                      <ThemedText type="caption" secondary>
                        {typeof selectedRequest.userId === 'object' ? selectedRequest.userId.registerId : ''}
                      </ThemedText>
                    </View>
                  </View>
                </View>
                <View style={[styles.infoCard, { backgroundColor: theme.backgroundSecondary }]}>
                  <View style={styles.detailRow}>
                    <View style={styles.iconBox}><Feather name="calendar" size={16} color={Colors.secondary.main} /></View>
                    <View>
                      <ThemedText type="caption" secondary>Duration</ThemedText>
                      <ThemedText type="body" style={{ fontWeight: '600' }}>{formatDate(selectedRequest.fromDate)} - {formatDate(selectedRequest.toDate)}</ThemedText>
                    </View>
                  </View>
                  <View style={[styles.divider, { backgroundColor: theme.border, marginVertical: Spacing.sm }]} />
                  <View style={styles.detailRow}>
                    <View style={styles.iconBox}><Feather name="file-text" size={16} color={Colors.secondary.main} /></View>
                    <View style={{ flex: 1 }}>
                      <ThemedText type="caption" secondary>Reason</ThemedText>
                      <ThemedText type="body" style={{ lineHeight: 20 }}>{selectedRequest.reason}</ThemedText>
                    </View>
                  </View>
                  {!!selectedRequest.isEmergency && (
                    <View style={[styles.emergencyBanner, { backgroundColor: Colors.status.error + '15', borderColor: Colors.status.error + '30' }]}>
                      <Feather name="alert-circle" size={16} color={Colors.status.error} />
                      <ThemedText style={{ color: Colors.status.error, fontWeight: '600' }}>Marked as Emergency</ThemedText>
                    </View>
                  )}
                </View>
                {!!selectedRequest.imageUrl && (
                  <View style={styles.attachmentSection}>
                    <ThemedText type="bodySmall" secondary style={{ marginBottom: Spacing.xs }}>Attachment</ThemedText>
                    <Pressable
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, backgroundColor: Colors.primary.main + '10', borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.primary.main + '30', marginBottom: Spacing.sm }}
                      onPress={async () => {
                        const url = selectedRequest.imageUrl;
                        const canOpen = await Linking.canOpenURL(url);
                        if (canOpen) {
                          await Linking.openURL(url);
                        } else {
                          Alert.alert("Error", "Cannot open this link");
                        }
                      }}
                    >
                      <Feather name="link" size={16} color={Colors.primary.main} />
                      <ThemedText type="bodySmall" style={{ color: Colors.primary.main, fontWeight: '600' }}>Open Source Link</ThemedText>
                    </Pressable>
                    <Image source={{ uri: selectedRequest.imageUrl }} resizeMode="cover" style={[styles.fullImage, { backgroundColor: 'transparent' }]} />
                  </View>
                )}
                {selectedRequest.status === "pending" ? (
                  <View style={styles.actionSection}>
                    <ThemedText type="bodySmall" style={{ fontWeight: '600', marginBottom: Spacing.xs }}>Admin Remarks</ThemedText>
                    <TextInput
                      style={[styles.textArea, { backgroundColor: theme.backgroundDefault, borderColor: theme.border, color: theme.text }]}
                      placeholder="Add a note for the student..."
                      placeholderTextColor={theme.textSecondary}
                      value={adminRemarks}
                      onChangeText={setAdminRemarks}
                      multiline
                      numberOfLines={3}
                    />
                    <View style={styles.actionButtons}>
                      <Button variant="outline" onPress={() => handleAction("rejected")} style={[styles.rejectButton, { borderColor: Colors.status.error }]} textStyle={{ color: Colors.status.error }}>Reject</Button>
                      <Button onPress={() => handleAction("approved")} loading={updateRequestMutation.isPending} style={styles.approveButton}>Approve Request</Button>
                    </View>
                  </View>
                ) : (
                  <View style={[styles.statusBanner, { backgroundColor: (STATUS_COLORS as any)[selectedRequest.status] + '20' }]}>
                    <ThemedText style={{ color: (STATUS_COLORS as any)[selectedRequest.status], fontWeight: 'bold', textAlign: 'center' }}>
                      Request {selectedRequest.status.charAt(0).toUpperCase() + selectedRequest.status.slice(1)}
                    </ThemedText>
                    {!!selectedRequest.adminRemarks && (
                      <ThemedText type="caption" style={{ textAlign: 'center', marginTop: 4 }}>
                        "{selectedRequest.adminRemarks}"
                      </ThemedText>
                    )}
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
      <LoadingOverlay visible={isLoading} message="Fetching leave requests..." icon="clock" color={Colors.secondary.main} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerSection: {
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    elevation: 2,
    ...(Platform.OS === 'web' ? { boxShadow: '0px 2px 2px rgba(0, 0, 0, 0.05)' } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
    })
  },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  statBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  tabScroll: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  listContent: { padding: Spacing.lg, gap: Spacing.md },
  emptyState: { alignItems: 'center', marginTop: Spacing.xxl * 2 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.md },
  emptyText: { opacity: 0.7 },
  requestCard: { borderRadius: BorderRadius.md, padding: Spacing.md, ...Shadows.card },
  emergencyCard: { borderWidth: 1, borderColor: Colors.status.error + '50' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  userInfo: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  statusChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  divider: { height: 1, marginVertical: Spacing.md, opacity: 0.5 },
  cardBody: { gap: Spacing.xs },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  reasonText: { lineHeight: 20 },
  emergencyTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: Spacing.sm, padding: 4, backgroundColor: Colors.status.error + '10', alignSelf: 'flex-start', borderRadius: 4 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)", justifyContent: "center", padding: Spacing.lg },
  modalContent: { borderRadius: BorderRadius.lg, maxHeight: '85%', overflow: 'hidden' },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  closeBtn: { padding: 4, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 20 },
  modalBody: { padding: Spacing.lg, gap: Spacing.md },
  infoCard: { padding: Spacing.md, borderRadius: BorderRadius.md },
  detailRow: { flexDirection: 'row', gap: Spacing.md },
  iconBox: { width: 32, alignItems: 'center', marginTop: 2 },
  emergencyBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.sm, marginTop: Spacing.md, borderWidth: 1 },
  attachmentSection: { marginTop: Spacing.sm },
  fullImage: { width: "100%", height: 200, borderRadius: BorderRadius.md },
  actionSection: { marginTop: Spacing.md },
  textArea: { height: 100, borderWidth: 1, borderRadius: BorderRadius.sm, padding: Spacing.md, textAlignVertical: "top", fontSize: 14, marginBottom: Spacing.lg },
  actionButtons: { flexDirection: "row", gap: Spacing.md },
  rejectButton: { flex: 1, borderWidth: 1 },
  approveButton: { flex: 1 },
  statusBanner: { padding: Spacing.lg, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.md }
});
