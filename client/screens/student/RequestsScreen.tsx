import React, { useState } from "react";
import { StyleSheet, View, ScrollView, Pressable, Modal, TextInput, Alert, FlatList, Platform } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, getQueryFn } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { FloatingBackground } from "@/components/FloatingBackground";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { EmptyState } from "@/components/EmptyState";

type FilterTab = "all" | "pending" | "approved" | "rejected";

const STATUS_COLORS = {
  pending: Colors.status.warning,
  approved: Colors.status.success,
  rejected: Colors.status.error,
};

export default function RequestsScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [showModal, setShowModal] = useState(false);
  const [fromDate, setFromDate] = useState(new Date());
  const [toDate, setToDate] = useState(new Date());
  const [reason, setReason] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isEmergency, setIsEmergency] = useState(false);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const { data: requests, isLoading, refetch } = useQuery({
    queryKey: ['leave-requests', 'user', user?.id],
    enabled: !!user?.id,
  });

  const { data: hostelSettings } = useQuery({
    queryKey: ['hostel-settings', user?.hostelBlock],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!user?.hostelBlock,
  });

  const activeSession = hostelSettings as any;

  const createRequestMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/leave-requests", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      setShowModal(false);
      resetForm();
      Alert.alert("Success", "Leave request submitted successfully!");
    },
    onError: () => {
      Alert.alert("Error", "Failed to submit leave request");
    },
  });

  const resetForm = () => {
    setFromDate(new Date());
    setToDate(new Date());
    setReason("");
    setImageUrl("");
    setIsEmergency(false);
  };

  const handleSubmit = () => {
    if (!reason.trim()) {
      Alert.alert("Error", "Please enter a reason for leave");
      return;
    }
    if (toDate < fromDate) {
      Alert.alert("Error", "End date cannot be before start date");
      return;
    }
    if (!user?.id) return;

    createRequestMutation.mutate({
      userId: user.id,
      fromDate: fromDate.toISOString().split('T')[0],
      toDate: toDate.toISOString().split('T')[0],
      reason: reason.trim(),
      imageUrl: imageUrl.trim() || undefined,
      isEmergency,
    });
  };

  const filteredRequests = React.useMemo(() => {
    const allRequests = requests as any[] || [];
    if (activeTab === "all") return allRequests;
    return allRequests.filter((r) => r.status === activeTab);
  }, [requests, activeTab]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const tabs: FilterTab[] = ["all", "pending", "approved", "rejected"];

  return (
    <ThemedView style={styles.container}>
      <FloatingBackground primaryColor={Colors.primary.main} secondaryColor={Colors.secondary.main} />

      <View style={[styles.headerSpacing, { paddingTop: headerHeight + Spacing.lg }]}>
        {activeSession?.leaveWindowLabel &&
          activeSession?.leaveWindowTo &&
          new Date(activeSession.leaveWindowTo).setHours(23, 59, 59, 999) >= Date.now() ? (
          <View style={[styles.activeSessionCard, { backgroundColor: theme.backgroundDefault }]}>
            <View style={styles.activeSessionHeader}>
              <View style={[styles.sessionIcon, { backgroundColor: Colors.primary.main + '20' }]}>
                <Feather name="info" size={20} color={Colors.primary.main} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText type="h3">{activeSession.leaveWindowLabel}</ThemedText>
                <ThemedText type="bodySmall" secondary>Active Holiday for {user?.hostelBlock}</ThemedText>
              </View>
            </View>
            <View style={styles.sessionDates}>
              <View style={styles.dateInfo}>
                <ThemedText type="caption" secondary>STARTS</ThemedText>
                <ThemedText type="body">{formatDate(activeSession.leaveWindowFrom)}</ThemedText>
              </View>
              <Feather name="arrow-right" size={16} color={theme.textSecondary} />
              <View style={styles.dateInfo}>
                <ThemedText type="caption" secondary>ENDS</ThemedText>
                <ThemedText type="body">{formatDate(activeSession.leaveWindowTo)}</ThemedText>
              </View>
            </View>
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          {tabs.map((tab) => (
            <Pressable
              key={tab}
              style={[
                styles.tab,
                {
                  backgroundColor: activeTab === tab ? Colors.primary.main : theme.backgroundDefault,
                  borderColor: activeTab === tab ? Colors.primary.main : theme.border,
                },
              ]}
              onPress={() => setActiveTab(tab)}
            >
              <ThemedText
                type="bodySmall"
                style={[styles.tabText, { color: activeTab === tab ? "#FFFFFF" : theme.text }]}
              >
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
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: tabBarHeight + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshing={isLoading}
        onRefresh={refetch}
        ListHeaderComponent={() => (
          activeSession?.leaveWindowLabel &&
            activeSession?.leaveWindowTo &&
            new Date(activeSession.leaveWindowTo).setHours(23, 59, 59, 999) >= Date.now() ? (
            <View style={[styles.leaveBanner, { backgroundColor: Colors.status.warning + '15', borderColor: Colors.status.warning + '40' }]}>
              <View style={styles.leaveBannerIcon}>
                <Feather name="info" size={20} color={Colors.status.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText type="bodySmall" style={{ fontWeight: '700', color: Colors.status.warning }}>
                  Hostel Holiday: {activeSession.leaveWindowLabel}
                </ThemedText>
                <ThemedText type="caption" secondary>
                  {new Date(activeSession.leaveWindowFrom).toLocaleDateString()} - {new Date(activeSession.leaveWindowTo).toLocaleDateString()}
                </ThemedText>
              </View>
            </View>
          ) : null
        )}
        ListEmptyComponent={() => (
          <EmptyState title="No leave requests found" subtitle="Submit a new request to get started." icon="calendar" />
        )}
        renderItem={({ item }) => (
          <View style={[styles.requestCard, { backgroundColor: theme.backgroundDefault }]}>
            <View style={styles.requestHeader}>
              <View style={styles.dateRange}>
                <Feather name="calendar" size={18} color={Colors.primary.main} />
                <ThemedText type="body" style={styles.dateText}>
                  {formatDate(item.fromDate)} - {formatDate(item.toDate)}
                </ThemedText>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status as keyof typeof STATUS_COLORS] }]}>
                <ThemedText type="caption" style={styles.statusText}>
                  {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                </ThemedText>
              </View>
            </View>
            {item.isEmergency ? (
              <View style={styles.emergencyBadge}>
                <Feather name="alert-triangle" size={14} color={Colors.status.error} />
                <ThemedText type="caption" style={{ color: Colors.status.error }}>Emergency</ThemedText>
              </View>
            ) : null}
            <ThemedText type="bodySmall" secondary style={styles.reasonText}>
              {item.reason}
            </ThemedText>
            {!!item.imageUrl && (
              <View style={styles.imagePreviewContainer}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
                  <Feather name="paperclip" size={14} color={Colors.primary.main} />
                  <ThemedText type="caption" style={{ fontWeight: '600' }}>Attachment Included</ThemedText>
                </View>
                <ThemedText type="caption" secondary numberOfLines={1}>
                  {item.imageUrl}
                </ThemedText>
                <ThemedText type="caption" style={{ color: Colors.status.info, marginTop: 2 }}>
                  ✓ Admin can view this link
                </ThemedText>
              </View>
            )}
            {item.adminRemarks ? (
              <View style={[styles.remarksContainer, { backgroundColor: theme.backgroundSecondary }]}>
                <ThemedText type="caption" secondary>Admin Remarks:</ThemedText>
                <ThemedText type="bodySmall">{item.adminRemarks}</ThemedText>
              </View>
            ) : null}
          </View>
        )}
      />

      <Pressable
        style={[styles.fab, { backgroundColor: Colors.primary.main }]}
        onPress={() => setShowModal(true)}
        accessibilityRole="button"
        accessibilityLabel="Create leave request"
        hitSlop={8}
        android_ripple={{ color: "rgba(255,255,255,0.2)", borderless: true }}
      >
        <Feather name="plus" size={24} color="#FFFFFF" />
      </Pressable>

      <Modal
        visible={showModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowModal(false)}
        accessibilityViewIsModal={true}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundRoot }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="h3">New Leave Request</ThemedText>
              <Pressable
                onPress={() => setShowModal(false)}
                accessibilityRole="button"
                accessibilityLabel="Close new leave request"
                hitSlop={10}
                android_ripple={{ color: "rgba(0,0,0,0.08)", borderless: true }}
              >
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>

            <KeyboardAwareScrollViewCompat contentContainerStyle={styles.modalForm}>
              <View style={styles.datePickerRow}>
                <View style={styles.datePickerItem}>
                  <ThemedText type="bodySmall" secondary style={styles.label}>From Date</ThemedText>
                  {Platform.OS === 'web' ? (
                    <input
                      type="date"
                      style={{
                        padding: '10px',
                        backgroundColor: theme.backgroundDefault,
                        color: theme.text,
                        borderRadius: BorderRadius.sm,
                        borderWidth: 1,
                        borderColor: theme.border,
                        fontSize: '16px',
                        fontFamily: 'inherit',
                      }}
                      value={fromDate.toISOString().split('T')[0]}
                      onChange={(e) => {
                        const newDate = new Date(e.target.value + 'T00:00:00Z');
                        if (!isNaN(newDate.getTime())) {
                          setFromDate(newDate);
                        }
                      }}
                    />
                  ) : (
                    <Pressable
                      style={[styles.dateButton, { backgroundColor: theme.backgroundDefault }]}
                      onPress={() => setShowFromPicker((prev) => !prev)}
                    >
                      <Feather name="calendar" size={18} color={theme.text} />
                      <ThemedText type="body">{fromDate.toLocaleDateString()}</ThemedText>
                    </Pressable>
                  )}
                </View>
                <View style={styles.datePickerItem}>
                  <ThemedText type="bodySmall" secondary style={styles.label}>To Date</ThemedText>
                  {Platform.OS === 'web' ? (
                    <input
                      type="date"
                      style={{
                        padding: '10px',
                        backgroundColor: theme.backgroundDefault,
                        color: theme.text,
                        borderRadius: BorderRadius.sm,
                        borderWidth: 1,
                        borderColor: theme.border,
                        fontSize: '16px',
                        fontFamily: 'inherit',
                      }}
                      value={toDate.toISOString().split('T')[0]}
                      onChange={(e) => {
                        const newDate = new Date(e.target.value + 'T00:00:00Z');
                        if (!isNaN(newDate.getTime())) {
                          setToDate(newDate);
                        }
                      }}
                    />
                  ) : (
                    <Pressable
                      style={[styles.dateButton, { backgroundColor: theme.backgroundDefault }]}
                      onPress={() => setShowToPicker((prev) => !prev)}
                    >
                      <Feather name="calendar" size={18} color={theme.text} />
                      <ThemedText type="body">{toDate.toLocaleDateString()}</ThemedText>
                    </Pressable>
                  )}
                </View>
              </View>

              {showFromPicker && Platform.OS !== 'web' && (
                <DateTimePicker
                  value={fromDate}
                  mode="date"
                  display="default"
                  onChange={(event, date) => {
                    if (Platform.OS === 'android') {
                      setShowFromPicker(false);
                    }
                    if (date) setFromDate(date);
                  }}
                  minimumDate={new Date()}
                />
              )}

              {showToPicker && Platform.OS !== 'web' && (
                <DateTimePicker
                  value={toDate}
                  mode="date"
                  display="default"
                  onChange={(event, date) => {
                    if (Platform.OS === 'android') {
                      setShowToPicker(false);
                    }
                    if (date) setToDate(date);
                  }}
                  minimumDate={fromDate}
                />
              )}

              <ThemedText type="bodySmall" secondary style={styles.label}>Reason</ThemedText>
              <TextInput
                style={[styles.textArea, { backgroundColor: theme.backgroundDefault, color: theme.text }]}
                placeholder="Enter reason for leave..."
                placeholderTextColor={theme.textSecondary}
                value={reason}
                onChangeText={setReason}
                multiline
                numberOfLines={4}
              />

              <View style={{ gap: Spacing.xs }}>
                <ThemedText type="bodySmall" secondary style={styles.label}>
                  📎 Attachment Link (Optional)
                </ThemedText>
                <ThemedText type="caption" secondary style={{ marginBottom: Spacing.xs }}>
                  Paste a link to supporting documents (Google Drive, OneDrive, etc.)
                </ThemedText>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.backgroundDefault, color: theme.text, borderWidth: 1, borderColor: imageUrl ? Colors.primary.main : theme.border }]}
                  placeholder="https://drive.google.com/..."
                  placeholderTextColor={theme.textSecondary}
                  value={imageUrl}
                  onChangeText={setImageUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                {!!imageUrl && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.xs }}>
                    <Feather name="check-circle" size={14} color={Colors.status.success} />
                    <ThemedText type="caption" style={{ color: Colors.status.success }}>
                      Link added - Admin will be able to view this
                    </ThemedText>
                  </View>
                )}
              </View>

              <Pressable
                style={styles.emergencyToggle}
                onPress={() => setIsEmergency(!isEmergency)}
              >
                <View style={[styles.checkbox, isEmergency && styles.checkboxChecked]}>
                  {isEmergency ? <Feather name="check" size={14} color="#FFFFFF" /> : null}
                </View>
                <ThemedText type="body">Mark as Emergency Leave</ThemedText>
              </Pressable>

              <Button
                onPress={handleSubmit}
                loading={createRequestMutation.isPending}
                fullWidth
              >
                Submit Request
              </Button>
            </KeyboardAwareScrollViewCompat>
          </View>
        </View>
      </Modal>
      <LoadingOverlay visible={isLoading} message="Fetching requests..." icon="calendar" />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerSpacing: {
    paddingHorizontal: Spacing.lg,
  },
  activeSessionCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
    ...Shadows.card,
    borderWidth: 1,
    borderColor: Colors.primary.main + '20',
  },
  activeSessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  sessionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sessionDates: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.02)',
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  dateInfo: {
    alignItems: 'center',
    gap: 2,
  },
  tabScroll: {
    gap: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  tab: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  tabText: {
    fontWeight: "500",
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  requestCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
    ...Shadows.card,
  },
  requestHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  dateRange: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  dateText: {
    fontWeight: "600",
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    color: "#FFFFFF",
  },
  emergencyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  reasonText: {
    marginBottom: Spacing.sm,
  },
  remarksContainer: {
    padding: Spacing.md,
    borderRadius: BorderRadius.xs,
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  emptyState: {
    padding: Spacing.xxl,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    marginTop: Spacing.xl,
  },
  emptyText: {
    marginTop: Spacing.md,
  },
  fab: {
    position: "absolute",
    right: Spacing.lg,
    bottom: Spacing.tabBarHeight + Spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    ...Shadows.fab,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    maxHeight: "80%",
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  modalForm: {
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  datePickerRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  datePickerItem: {
    flex: 1,
  },
  label: {
    marginBottom: Spacing.sm,
  },
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.xs,
  },
  textArea: {
    height: 100,
    borderRadius: BorderRadius.xs,
    padding: Spacing.md,
    textAlignVertical: "top",
    fontSize: 16,
  },
  emergencyToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.primary.main,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: Colors.primary.main,
  },
  input: {
    height: 50,
    borderRadius: BorderRadius.xs,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
    marginBottom: Spacing.md,
  },
  imagePreviewContainer: {
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: BorderRadius.xs,
  },
  leaveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
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
