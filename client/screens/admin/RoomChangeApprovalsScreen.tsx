import React, { useState } from "react";
import { StyleSheet, View, ScrollView, Pressable, Modal, TextInput, Alert, FlatList } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { FloatingBackground } from "@/components/FloatingBackground";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { EmptyState } from "@/components/EmptyState";

type FilterTab = "pending" | "all" | "approved" | "rejected";

const STATUS_COLORS = { pending: Colors.status.warning, approved: Colors.status.success, rejected: Colors.status.error };

export default function RoomChangeApprovalsScreen() {
    const headerHeight = useHeaderHeight();
    const tabBarHeight = useBottomTabBarHeight();
    const { theme } = useTheme();
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const [activeTab, setActiveTab] = useState<FilterTab>("pending");
    const [selectedRequest, setSelectedRequest] = useState<any>(null);
    const [showModal, setShowModal] = useState(false);
    const [adminRemarks, setAdminRemarks] = useState("");

    const { data: requests, isLoading } = useQuery({
        queryKey: ['/room-change-requests/hostel', user?.hostelBlock],
        enabled: !!user?.hostelBlock,
    });

    // Check availability of the requested room when modal is open
    const { data: targetRoom, isFetching: isCheckingRoom } = useQuery({
        queryKey: ["/rooms", selectedRequest?.requestedRoom, user?.hostelBlock],
        enabled: !!selectedRequest?.requestedRoom && showModal,
        retry: false
    });

    const targetRoomData = targetRoom as any;
    const isTargetFull = targetRoomData && targetRoomData.currentOccupancy >= targetRoomData.capacity;

    const updateStatusMutation = useMutation({
        mutationFn: async ({ id, status, remarks }: { id: string; status: string; remarks: string }) => {
            const res = await apiRequest("PUT", `/room-change-requests/${id}`, { status, adminRemarks: remarks });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Failed to update request");
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['/room-change-requests/hostel'] });
            queryClient.invalidateQueries({ queryKey: ['/stats/admin'] });
            setShowModal(false);
            setSelectedRequest(null);
            setAdminRemarks("");
            Alert.alert("Success", "Request updated");
        },
        onError: (err: Error) => {
            console.error("Mutation error:", err);
            Alert.alert("Error", err.message);
        }
    });

    const filteredRequests = (requests as any[] || []).filter(r => {
        if (activeTab === "all") return true;
        return r.status === activeTab;
    });

    const handleAction = (status: "approved" | "rejected") => {
        if (!selectedRequest) return;
        if (status === 'approved' && isTargetFull) {
            Alert.alert("Cannot Approve", "The requested room is already full. You cannot approve this request.");
            return;
        }
        updateStatusMutation.mutate({ id: selectedRequest._id, status, remarks: adminRemarks });
    };

    return (
        <ThemedView style={styles.container}>
            <FloatingBackground primaryColor={Colors.secondary.main} secondaryColor={Colors.primary.main} />

            <View style={[styles.tabContainer, { paddingTop: headerHeight + Spacing.md }]}>
                {["pending", "approved", "rejected", "all"].map((tab) => (
                    <Pressable
                        key={tab}
                        style={[styles.tab, activeTab === tab && { backgroundColor: Colors.primary.main }]}
                        onPress={() => setActiveTab(tab as FilterTab)}
                    >
                        <ThemedText style={{ color: activeTab === tab ? "#FFF" : theme.textSecondary }}>
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </ThemedText>
                    </Pressable>
                ))}
            </View>

            <FlatList
                data={filteredRequests}
                keyExtractor={(item) => item._id}
                contentContainerStyle={{ padding: Spacing.lg, paddingBottom: tabBarHeight + 120 }}
                renderItem={({ item }) => (
                    <Pressable
                        style={[styles.card, { backgroundColor: theme.backgroundDefault }]}
                        onPress={() => { setSelectedRequest(item); setAdminRemarks(item.adminRemarks || ""); setShowModal(true); }}
                    >
                        <View style={styles.cardHeader}>
                            <View>
                                <ThemedText type="body" style={{ fontWeight: 'bold' }}>{item.userId?.name || 'Unknown Student'}</ThemedText>
                                <ThemedText type="caption" secondary>{item.userId?.registerId || ''}</ThemedText>
                            </View>
                            <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status as keyof typeof STATUS_COLORS] + '20' }]}>
                                <ThemedText type="caption" style={{ color: STATUS_COLORS[item.status as keyof typeof STATUS_COLORS] }}>
                                    {item.status.toUpperCase()}
                                </ThemedText>
                            </View>
                        </View>
                        <View style={styles.cardBody}>
                            <ThemedText type="bodySmall">Current: {item.currentRoom} → Requested: {item.requestedRoom || 'Any'}</ThemedText>
                            <ThemedText type="caption" secondary numberOfLines={1} style={{ marginTop: 4 }}>{item.reason}</ThemedText>
                        </View>
                    </Pressable>
                )}
                ListEmptyComponent={<EmptyState title="No requests found" subtitle="Room change requests will appear here." icon="inbox" />}
            />

            <Modal visible={showModal} transparent animationType="fade" accessibilityViewIsModal={true}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: theme.backgroundRoot }]}>
                        <View style={styles.modalHeader}>
                            <ThemedText type="h3">Room Change Details</ThemedText>
                            <Pressable
                                onPress={() => setShowModal(false)}
                                accessibilityRole="button"
                                accessibilityLabel="Close room change details"
                                hitSlop={10}
                                android_ripple={{ color: "rgba(0,0,0,0.08)", borderless: true }}
                            ><Feather name="x" size={24} color={theme.text} /></Pressable>
                        </View>
                        <View style={styles.modalBody}>
                            <ThemedText type="body">Student: {selectedRequest?.userId?.name}</ThemedText>
                            <ThemedText type="body">Current Room: {selectedRequest?.currentRoom}</ThemedText>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <ThemedText type="body">Requested Room: {selectedRequest?.requestedRoom || 'Any'}</ThemedText>
                                {selectedRequest?.requestedRoom && (
                                    <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: isCheckingRoom ? '#EEE' : (isTargetFull ? Colors.status.error + '15' : Colors.status.success + '15') }}>
                                        <ThemedText type="caption" style={{ color: isCheckingRoom ? '#666' : (isTargetFull ? Colors.status.error : Colors.status.success) }}>
                                            {isCheckingRoom ? 'Checking...' : (isTargetFull ? 'FULL' : 'AVAILABLE')}
                                        </ThemedText>
                                    </View>
                                )}
                            </View>

                            {targetRoomData && (
                                <View style={{ backgroundColor: theme.backgroundSecondary, padding: 8, borderRadius: 8 }}>
                                    <ThemedText type="caption" secondary>
                                        Room {targetRoomData.roomNumber} Status: {targetRoomData.currentOccupancy}/{targetRoomData.capacity} Students
                                    </ThemedText>
                                </View>
                            )}

                            <ThemedText type="body" style={{ marginTop: 10, fontWeight: 'bold' }}>Reason:</ThemedText>
                            <ThemedText type="body">{selectedRequest?.reason}</ThemedText>

                            <ThemedText type="body" style={{ marginTop: 20, fontWeight: 'bold' }}>Admin Remarks:</ThemedText>
                            <TextInput
                                style={[styles.textArea, { backgroundColor: theme.backgroundDefault, color: theme.text }]}
                                value={adminRemarks}
                                onChangeText={setAdminRemarks}
                                placeholder="Add remarks..."
                                multiline
                            />

                            {selectedRequest?.status === 'pending' && (
                                <View style={styles.actionButtons}>
                                    <Button
                                        variant="outline"
                                        onPress={() => handleAction("rejected")}
                                        style={{ flex: 1, borderColor: Colors.status.error }}
                                        textStyle={{ color: Colors.status.error }}
                                        loading={updateStatusMutation.isPending}
                                    >
                                        Reject
                                    </Button>
                                    <Button
                                        onPress={() => handleAction("approved")}
                                        style={{ flex: 1 }}
                                        disabled={isTargetFull}
                                        loading={updateStatusMutation.isPending}
                                    >
                                        Approve
                                    </Button>
                                </View>
                            )}
                        </View>
                    </View>
                </View>
            </Modal>

            <LoadingOverlay visible={isLoading} message="Loading requests..." icon="refresh-cw" />
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    tabContainer: { flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.md },
    tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.primary.main + '40' },
    card: { padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.md, ...Shadows.card },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
    cardBody: { marginTop: 10 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: Spacing.xl },
    modalContent: { borderRadius: BorderRadius.lg, padding: Spacing.xl },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalBody: { gap: 10 },
    textArea: { height: 80, borderRadius: BorderRadius.sm, padding: 10, textAlignVertical: 'top', marginTop: 5 },
    actionButtons: { flexDirection: 'row', gap: 10, marginTop: 20 }
});
