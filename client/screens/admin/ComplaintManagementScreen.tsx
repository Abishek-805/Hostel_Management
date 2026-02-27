import React, { useState } from "react";
import { StyleSheet, View, ScrollView, Pressable, Modal, TextInput, Alert, FlatList, Linking, RefreshControl } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { apiRequest, getQueryFn } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { FloatingBackground } from "@/components/FloatingBackground";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { EmptyState } from "@/components/EmptyState";

type ComplaintCategory = "water" | "electricity" | "cleaning" | "food" | "others";
type ComplaintStatus = "submitted" | "in_progress" | "resolved";

const CATEGORY_ICONS: Record<ComplaintCategory, keyof typeof Feather.glyphMap> = { water: "droplet", electricity: "zap", cleaning: "trash-2", food: "coffee", others: "more-horizontal" };

const CATEGORY_COLORS: Record<ComplaintCategory, string> = {
  water: "#3B82F6", // Blue
  electricity: "#F59E0B", // Amber
  cleaning: "#8B5CF6", // Violet
  food: "#EF4444", // Red
  others: "#6B7280", // Gray
};

const STATUS_COLORS: Record<ComplaintStatus, string> = { submitted: Colors.status.info, in_progress: Colors.status.warning, resolved: Colors.status.success };

export default function ComplaintManagementScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const queryClient = useQueryClient();

  const [selectedStatus, setSelectedStatus] = useState<ComplaintStatus | "all">("all");
  const [selectedComplaint, setSelectedComplaint] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [newStatus, setNewStatus] = useState<ComplaintStatus>("submitted");
  const [adminRemarks, setAdminRemarks] = useState("");

  const { data: complaints, isLoading, refetch } = useQuery({
    queryKey: ['/complaints'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const [refreshing, setRefreshing] = useState(false);

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

  const updateComplaintMutation = useMutation({
    mutationFn: async ({ id, status, remarks }: { id: string; status: string; remarks?: string }) => {
      const response = await apiRequest("PATCH", `/complaints/${id}/status`, { status, adminRemarks: remarks });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/complaints'] });
      queryClient.invalidateQueries({ queryKey: ['/stats/admin'] });
      setShowModal(false);
      setSelectedComplaint(null);
      setAdminRemarks("");
      Alert.alert("Success", "Complaint updated!");
    },
    onError: () => Alert.alert("Error", "Failed to update complaint"),
  });

  const filteredComplaints = React.useMemo(() => {
    const all = complaints as any[];
    if (!all) return [];
    if (selectedStatus === "all") return all;
    return all.filter((c) => c.status === selectedStatus);
  }, [complaints, selectedStatus]);

  const handleUpdate = () => {
    if (!selectedComplaint) return;
    updateComplaintMutation.mutate({ id: selectedComplaint.id || selectedComplaint._id, status: newStatus, remarks: adminRemarks });
  };

  const statuses: (ComplaintStatus | "all")[] = ["all", "submitted", "in_progress", "resolved"];

  return (
    <ThemedView style={styles.container}>
      <FloatingBackground primaryColor={Colors.secondary.main} secondaryColor={Colors.primary.main} />
      <Animated.View entering={FadeInDown.delay(100)} style={[styles.filterContainer, { paddingTop: headerHeight + Spacing.lg }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {statuses.map((status) => (
            <Pressable key={status} style={[styles.filterChip, { backgroundColor: selectedStatus === status ? Colors.primary.main : theme.backgroundDefault, borderColor: selectedStatus === status ? Colors.primary.main : theme.border }]} onPress={() => setSelectedStatus(status)}>
              <ThemedText type="bodySmall" style={{ color: selectedStatus === status ? "#FFFFFF" : theme.text, fontWeight: "500" }}>{status === "in_progress" ? "In Progress" : status.charAt(0).toUpperCase() + status.slice(1)}</ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      </Animated.View>

      <FlatList data={filteredComplaints} keyExtractor={(item) => item.id || item._id} contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + 100 }]} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary.main} />}
        ListEmptyComponent={() => (
          <Animated.View entering={FadeInDown.delay(200)}>
            <EmptyState title="No complaints found" subtitle="New complaints will appear here." icon="check-circle" />
          </Animated.View>
        )}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(200 + index * 50)}>
            <Pressable
              style={[styles.complaintCard, { backgroundColor: theme.backgroundDefault }]}
              onPress={() => {
                setSelectedComplaint(item);
                setNewStatus(item.status);
                setAdminRemarks(item.adminRemarks || "");
                setShowModal(true);
              }}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.categoryIcon, { backgroundColor: CATEGORY_COLORS[item.category as ComplaintCategory] + "15" }]}>
                  <Feather name={CATEGORY_ICONS[item.category as ComplaintCategory]} size={20} color={CATEGORY_COLORS[item.category as ComplaintCategory]} />
                </View>
                <View style={styles.cardInfo}>
                  <ThemedText type="body" style={styles.categoryText}>{item.category.charAt(0).toUpperCase() + item.category.slice(1)}</ThemedText>
                  <ThemedText type="caption" secondary>{item.isAnonymous ? "Anonymous" : (typeof item.userId === 'object' ? item.userId.name : item.userId)}</ThemedText>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status as ComplaintStatus] + '20', borderColor: STATUS_COLORS[item.status as ComplaintStatus] + '40', borderWidth: 1 }]}>
                  <ThemedText type="caption" style={{ color: STATUS_COLORS[item.status as ComplaintStatus], fontSize: 10, fontWeight: '700' }}>
                    {item.status === "in_progress" ? "In Progress" : item.status.toUpperCase()}
                  </ThemedText>
                </View>
              </View>
              <View style={styles.cardBody}>
                <ThemedText type="bodySmall" secondary numberOfLines={2} style={styles.descriptionSnippet}>{item.description}</ThemedText>
                <View style={styles.cardFooter}>
                  <Feather name="clock" size={12} color={theme.textSecondary} />
                  <ThemedText type="caption" secondary style={{ marginLeft: 4 }}>
                    {new Date(item.createdAt).toLocaleDateString()}
                  </ThemedText>
                </View>
              </View>
            </Pressable>
          </Animated.View>
        )}
      />

      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)} accessibilityViewIsModal={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundRoot }]}>
            <View style={styles.modalHeader}>
              <View>
                <ThemedText type="h3">Complaint Details</ThemedText>
                <ThemedText type="caption" secondary>Track and manage this issue</ThemedText>
              </View>
              <Pressable onPress={() => setShowModal(false)} style={styles.closeButton}>
                <Feather name="x" size={20} color={theme.text} />
              </Pressable>
            </View>

            {selectedComplaint && (
              <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
                {/* Summary Card */}
                <View style={[styles.infoSection, { backgroundColor: theme.backgroundSecondary }]}>
                  <View style={styles.sectionHeader}>
                    <View style={[styles.largeIcon, { backgroundColor: CATEGORY_COLORS[selectedComplaint.category as ComplaintCategory] + "20" }]}>
                      <Feather name={CATEGORY_ICONS[selectedComplaint.category as ComplaintCategory]} size={24} color={CATEGORY_COLORS[selectedComplaint.category as ComplaintCategory]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ThemedText type="body" style={{ fontWeight: '700', textTransform: 'capitalize' }}>{selectedComplaint.category}</ThemedText>
                      <ThemedText type="caption" secondary>Posted on {new Date(selectedComplaint.createdAt).toLocaleDateString()}</ThemedText>
                    </View>
                    <View style={[styles.statusChip, { backgroundColor: STATUS_COLORS[selectedComplaint.status as ComplaintStatus] }]}>
                      <ThemedText type="caption" style={{ color: '#FFF', fontWeight: 'bold' }}>{selectedComplaint.status.toUpperCase()}</ThemedText>
                    </View>
                  </View>

                  <View style={[styles.divider, { backgroundColor: theme.border }]} />

                  <View style={styles.descriptionBox}>
                    <ThemedText type="bodySmall" secondary style={{ marginBottom: 4 }}>Issue Description</ThemedText>
                    <ThemedText type="body" style={{ lineHeight: 22 }}>{selectedComplaint.description}</ThemedText>
                  </View>
                </View>

                {/* Submitter Info */}
                <View style={[styles.infoSection, { backgroundColor: theme.backgroundSecondary }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={styles.smallAvatar}>
                      <Feather name={selectedComplaint.isAnonymous ? "eye-off" : "user"} size={16} color={Colors.primary.main} />
                    </View>
                    <View>
                      <ThemedText type="caption" secondary>Submitted By</ThemedText>
                      <ThemedText type="bodySmall" style={{ fontWeight: '600' }}>
                        {selectedComplaint.isAnonymous ? "Anonymous User" : (selectedComplaint.userId?.name || "Student")}
                      </ThemedText>
                      {!selectedComplaint.isAnonymous && <ThemedText type="caption" secondary>{selectedComplaint.userId?.registerId}</ThemedText>}
                    </View>
                  </View>
                </View>

                {/* Attachment */}
                {!!selectedComplaint.photoUrl && (
                  <View style={[styles.infoSection, { backgroundColor: theme.backgroundSecondary }]}>
                    <ThemedText type="bodySmall" secondary style={{ marginBottom: Spacing.sm }}>Evidence / Attachment</ThemedText>
                    <Pressable
                      style={styles.attachmentLink}
                      onPress={async () => {
                        const url = selectedComplaint.photoUrl;
                        const canOpen = await Linking.canOpenURL(url);
                        if (canOpen) await Linking.openURL(url);
                        else Alert.alert("Error", "Cannot open this link");
                      }}
                    >
                      <Feather name="external-link" size={16} color={Colors.primary.main} />
                      <ThemedText type="bodySmall" style={{ color: Colors.primary.main, fontWeight: '600' }}>View Attachment Content</ThemedText>
                    </Pressable>
                  </View>
                )}

                {/* Management Section */}
                <View style={[styles.managementCard, { borderTopColor: theme.border }]}>
                  {(selectedComplaint?.status?.toLowerCase() === 'submitted' || selectedComplaint?.status?.toLowerCase() === 'in_progress') ? (
                    <>
                      <ThemedText type="bodySmall" style={styles.managementLabel}>Update Status</ThemedText>
                      <View style={styles.statusOptions}>
                        {(["submitted", "in_progress", "resolved"] as ComplaintStatus[]).map((status) => (
                          <Pressable
                            key={status}
                            style={[
                              styles.statusOption,
                              {
                                backgroundColor: newStatus === status ? STATUS_COLORS[status] : theme.backgroundDefault,
                                borderColor: newStatus === status ? STATUS_COLORS[status] : theme.border
                              }
                            ]}
                            onPress={() => setNewStatus(status)}
                          >
                            <ThemedText type="caption" style={{ color: newStatus === status ? "#FFFFFF" : theme.textSecondary, fontWeight: '600' }}>
                              {status === "in_progress" ? "In Progress" : status.charAt(0).toUpperCase() + status.slice(1)}
                            </ThemedText>
                          </Pressable>
                        ))}
                      </View>
                      <ThemedText type="bodySmall" style={[styles.managementLabel, { marginTop: Spacing.md }]}>Admin Remarks</ThemedText>
                      <TextInput
                        style={[styles.textArea, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: theme.border }]}
                        placeholder="Add remarks for the student..."
                        placeholderTextColor={theme.textSecondary}
                        value={adminRemarks}
                        onChangeText={setAdminRemarks}
                        multiline
                        numberOfLines={4}
                      />
                      <Button onPress={handleUpdate} loading={updateComplaintMutation.isPending} style={{ marginTop: Spacing.md }}>
                        Update Record
                      </Button>
                    </>
                  ) : (
                    <View style={styles.resolutionContainer}>
                      <View style={[styles.resolutionHeader, { backgroundColor: Colors.status.success + '10' }]}>
                        <Feather name="check-circle" size={18} color={Colors.status.success} />
                        <ThemedText type="bodySmall" style={{ color: Colors.status.success, fontWeight: '700' }}>Resolution Details</ThemedText>
                      </View>
                      <View style={styles.resolutionBody}>
                        <ThemedText type="bodySmall" secondary style={{ marginBottom: 4 }}>Admin Summary</ThemedText>
                        <ThemedText type="body" style={{ color: theme.text }}>
                          {selectedComplaint.adminRemarks || "The issue has been successfully addressed and verified."}
                        </ThemedText>
                      </View>
                    </View>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
      <LoadingOverlay visible={isLoading} message="Fetching complaints..." icon="alert-circle" color={Colors.secondary.main} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filterContainer: { paddingHorizontal: Spacing.lg },
  filterScroll: { gap: Spacing.sm, paddingBottom: Spacing.lg },
  filterChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1 },
  listContent: { paddingHorizontal: Spacing.lg },
  complaintCard: { padding: Spacing.lg, borderRadius: BorderRadius.lg, marginBottom: Spacing.md, ...Shadows.card },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: Spacing.sm },
  categoryIcon: { width: 44, height: 44, borderRadius: BorderRadius.md, justifyContent: "center", alignItems: "center" },
  cardInfo: { flex: 1, marginLeft: Spacing.md },
  categoryText: { fontWeight: "700" },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderRadius: 8 },
  cardBody: { marginTop: Spacing.xs },
  descriptionSnippet: { lineHeight: 18 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm },
  emptyState: { padding: Spacing.xxl, borderRadius: BorderRadius.md, alignItems: "center", marginTop: Spacing.xl },
  emptyText: { marginTop: Spacing.md },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.7)", justifyContent: "flex-end" },
  modalContent: { height: "90%", borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, ...Shadows.modal },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
  closeButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.05)', justifyContent: 'center', alignItems: 'center' },
  modalBody: { padding: Spacing.xl, gap: Spacing.lg },
  infoSection: { padding: Spacing.lg, borderRadius: BorderRadius.lg, gap: Spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  largeIcon: { width: 50, height: 50, borderRadius: BorderRadius.md, justifyContent: 'center', alignItems: 'center' },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  divider: { height: 1, width: '100%', opacity: 0.1 },
  descriptionBox: { gap: 4 },
  smallAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primary.main + '10', justifyContent: 'center', alignItems: 'center' },
  attachmentLink: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, backgroundColor: Colors.primary.main + '05', borderRadius: BorderRadius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.primary.main + '30' },
  managementCard: { marginTop: Spacing.md, paddingTop: Spacing.xl, borderTopWidth: 1 },
  managementLabel: { fontWeight: '600', marginBottom: Spacing.sm, color: Colors.primary.main },
  statusOptions: { flexDirection: "row", gap: Spacing.sm },
  statusOption: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1.5, alignItems: "center" },
  textArea: { height: 100, borderRadius: BorderRadius.md, padding: Spacing.md, textAlignVertical: "top", fontSize: 15, borderWidth: 1 },
  resolutionContainer: { borderRadius: BorderRadius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Colors.status.success + '30' },
  resolutionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: Spacing.md },
  resolutionBody: { padding: Spacing.lg },
});
