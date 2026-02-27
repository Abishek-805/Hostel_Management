import React, { useMemo, useState } from "react";
import { StyleSheet, View, ScrollView, Pressable, Modal, TextInput, Alert, FlatList } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { apiRequest } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { FloatingBackground } from "@/components/FloatingBackground";
import { BrandedLoadingOverlay } from "@/components/BrandedLoadingOverlay";
import { useAuth } from "@/contexts/AuthContext";
import { HOSTEL_BLOCKS } from "@/constants/hostels";

const BLOCKS = ["Block A", "Block B", "Block C", "Block D"];

export default function ManageRoomsScreen() {
    const headerHeight = useHeaderHeight();
    const tabBarHeight = useBottomTabBarHeight();
    const insets = useSafeAreaInsets();
    const { theme } = useTheme();
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const [selectedHostel, setSelectedHostel] = useState(user?.hostelBlock || HOSTEL_BLOCKS[0]);
    const [selectedBlock, setSelectedBlock] = useState("Block A");
    const [showHostelModal, setShowHostelModal] = useState(false);

    const blockLetter = selectedBlock.split(" ")[1];

    const { data: rooms, isLoading } = useQuery({
        queryKey: ['/rooms/block', blockLetter, selectedHostel],
        queryFn: async () => {
            const res = await apiRequest('GET', `/rooms/block/${blockLetter}?hostelBlock=${encodeURIComponent(selectedHostel)}`);
            if (!res.ok) throw new Error('Failed to fetch rooms');
            return res.json();
        },
        enabled: !!blockLetter && !!selectedHostel
    });

    const { data: students } = useQuery({
        queryKey: ['/users', selectedHostel],
        queryFn: async () => {
            const res = await apiRequest('GET', `/users?hostelBlock=${encodeURIComponent(selectedHostel)}`);
            if (!res.ok) throw new Error('Failed to fetch students');
            return res.json();
        },
        enabled: !!selectedHostel
    });

    const [showAddRoomModal, setShowAddRoomModal] = useState(false);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [selectedRoom, setSelectedRoom] = useState<any>(null);
    const [newRoomNumber, setNewRoomNumber] = useState("");
    const [newCapacity, setNewCapacity] = useState("4");

    const [shiftingStudent, setShiftingStudent] = useState<any>(null);
    const [targetRoomInput, setTargetRoomInput] = useState("");
    const [showShiftModal, setShowShiftModal] = useState(false);

    const { data: roomStudents, refetch: refetchRoomStudents } = useQuery({
        queryKey: ['/users/roommates', selectedRoom?.roomNumber, selectedRoom?.hostelBlock],
        queryFn: async () => {
            const res = await apiRequest('GET', `/users/roommates/${selectedRoom?.roomNumber}/${encodeURIComponent(selectedRoom?.hostelBlock)}`);
            if (!res.ok) return [];
            return res.json();
        },
        enabled: !!selectedRoom
    });

    const addRoomMutation = useMutation({
        mutationFn: (data: any) => apiRequest("POST", "/rooms", { ...data, hostelBlock: selectedHostel }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['/rooms/block'] });
            setShowAddRoomModal(false);
            setNewRoomNumber("");
            Alert.alert("Success", "Room added successfully");
        },
        onError: (error: any) => Alert.alert("Error", error.message || "Failed to add room")
    });

    const allotMutation = useMutation({
        mutationFn: ({ userId, roomNumber, hostelBlock }: any) => apiRequest("PUT", `/users/${userId}`, { roomNumber, hostelBlock }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['/rooms/block'] });
            queryClient.invalidateQueries({ queryKey: ['/users'] });
            queryClient.invalidateQueries({ queryKey: ['/users/roommates'] });
            refetchRoomStudents();
            setShowShiftModal(false);
            setShiftingStudent(null);
            setTargetRoomInput("");
            Alert.alert("Success", "Student shifted successfully");
        },
        onError: (error: any) => Alert.alert("Error", error.message || "Failed to shift student")
    });

    const handleAddRoom = () => {
        if (!newRoomNumber) return Alert.alert("Error", "Please enter a room number");
        addRoomMutation.mutate({
            roomNumber: newRoomNumber,
            block: blockLetter,
            capacity: parseInt(newCapacity) || 4
        });
    };

    const handleShiftStudent = () => {
        if (!shiftingStudent || !targetRoomInput) return;
        const target = (rooms as any[] || []).find(r => r.roomNumber.toLowerCase() === targetRoomInput.toLowerCase());
        if (!target) return Alert.alert("Not Found", `Room ${targetRoomInput} not found in this block.`);
        if (target.currentOccupancy >= target.capacity) return Alert.alert("Full", "Target room is already full.");

        allotMutation.mutate({
            userId: shiftingStudent._id,
            roomNumber: target.roomNumber,
            hostelBlock: selectedHostel
        });
    };

    const allRooms = Array.isArray(rooms) ? rooms : [];
    const sortedRooms = useMemo(() => {
        const extractRoomParts = (roomNumber: string) => {
            const normalized = (roomNumber || '').trim();
            const prefix = (normalized.match(/[A-Za-z]+/)?.[0] || '').toUpperCase();
            const number = Number.parseInt(normalized.match(/\d+/)?.[0] || '0', 10);
            return { prefix, number, normalized };
        };

        return [...allRooms].sort((a: any, b: any) => {
            const roomA = extractRoomParts(a?.roomNumber ?? '');
            const roomB = extractRoomParts(b?.roomNumber ?? '');

            if (roomA.prefix !== roomB.prefix) {
                return roomA.prefix.localeCompare(roomB.prefix);
            }

            if (roomA.number !== roomB.number) {
                return roomA.number - roomB.number;
            }

            return roomA.normalized.localeCompare(roomB.normalized);
        });
    }, [allRooms]);

    const vacantRoomsList = allRooms.filter((r: any) => r.currentOccupancy === 0);
    const fullRoomsList = allRooms.filter((r: any) => r.currentOccupancy >= r.capacity);
    const partialRoomsList = allRooms.filter((r: any) => r.currentOccupancy > 0 && r.currentOccupancy < r.capacity);

    const getRoomColor = (room: any) => {
        const occupancyRate = room.currentOccupancy / room.capacity;
        if (occupancyRate === 0) return Colors.status.success;
        if (occupancyRate < 1) return Colors.status.warning;
        return Colors.status.error;
    };

    return (
        <ThemedView style={styles.container}>
            <FloatingBackground primaryColor={Colors.secondary.main} secondaryColor={Colors.primary.main} />

            <ScrollView
                contentContainerStyle={[styles.scrollContent, { paddingTop: headerHeight + Spacing.lg, paddingBottom: tabBarHeight + 40 }]}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.header}>
                    <ThemedText type="h2" style={styles.title}>Room Allotment</ThemedText>
                    <Pressable style={styles.hostelSelectorButton} onPress={() => setShowHostelModal(true)}>
                        <Feather name="map-pin" size={16} color={Colors.primary.main} style={{ marginRight: 8 }} />
                        <ThemedText type="bodySmall" style={{ fontWeight: '600' }}>{selectedHostel}</ThemedText>
                        <Feather name="chevron-down" size={16} color={theme.textSecondary} style={{ marginLeft: 8 }} />
                    </Pressable>
                </View>

                <Animated.View entering={FadeInDown.delay(200)} style={styles.blockSelector}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.blockRow}>
                        {BLOCKS.map((block) => (
                            <Pressable
                                key={block}
                                style={[styles.blockButton, { backgroundColor: selectedBlock === block ? Colors.primary.main : 'rgba(255,255,255,0.05)' }]}
                                onPress={() => setSelectedBlock(block)}
                            >
                                <ThemedText type="bodySmall" style={{ color: "#FFFFFF", fontWeight: "700" }}>{block}</ThemedText>
                            </Pressable>
                        ))}
                    </ScrollView>
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(300)} style={styles.statsRow}>
                    <View style={styles.statCard}>
                        <ThemedText style={[styles.statNumber, { color: Colors.status.success }]}>{vacantRoomsList.length}</ThemedText>
                        <ThemedText type="caption" style={{ color: theme.textSecondary }}>Vacant</ThemedText>
                    </View>
                    <View style={styles.statCard}>
                        <ThemedText style={[styles.statNumber, { color: Colors.status.warning }]}>{partialRoomsList.length}</ThemedText>
                        <ThemedText type="caption" style={{ color: theme.textSecondary }}>Partial</ThemedText>
                    </View>
                    <View style={styles.statCard}>
                        <ThemedText style={[styles.statNumber, { color: Colors.status.error }]}>{fullRoomsList.length}</ThemedText>
                        <ThemedText type="caption" style={{ color: theme.textSecondary }}>Full</ThemedText>
                    </View>
                </Animated.View>

                <View style={styles.roomGrid}>
                    {sortedRooms.map((room: any, index: number) => {
                        const statusColor = getRoomColor(room);
                        return (
                            <Animated.View entering={FadeInDown.delay(400 + (index * 20))} key={room._id} style={styles.roomCardContainer}>
                                <Pressable
                                    style={[styles.roomCard, { borderColor: statusColor + '60' }]}
                                    onPress={() => { setSelectedRoom(room); setShowDetailsModal(true); }}
                                >
                                    <ThemedText type="h3" style={[styles.roomNumber, { color: statusColor }]}>{room.roomNumber}</ThemedText>
                                    <View style={styles.occupancyRow}>
                                        <Feather name="users" size={12} color={theme.textSecondary} />
                                        <ThemedText type="caption" secondary style={{ fontWeight: '600' }}>{room.currentOccupancy}/{room.capacity}</ThemedText>
                                    </View>
                                </Pressable>
                            </Animated.View>
                        );
                    })}
                </View>
            </ScrollView>

            <Pressable style={[styles.fab, { backgroundColor: Colors.primary.main, bottom: insets.bottom + Spacing.xl }]} onPress={() => setShowAddRoomModal(true)}>
                <Feather name="plus" size={24} color="#FFFFFF" />
            </Pressable>

            {/* Room Details Modal */}
            <Modal visible={showDetailsModal} transparent animationType="slide" onRequestClose={() => setShowDetailsModal(false)}>
                <View style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowDetailsModal(false)} />
                    <View style={[styles.modalContent, { backgroundColor: theme.backgroundRoot, height: '75%' }]}>
                        <View style={styles.modalHeader}>
                            <View>
                                <ThemedText type="h3">Room {selectedRoom?.roomNumber}</ThemedText>
                                <ThemedText type="caption" secondary>{selectedRoom?.currentOccupancy}/{selectedRoom?.capacity} Occupied</ThemedText>
                            </View>
                            <Pressable onPress={() => { setShowDetailsModal(false); setShiftingStudent(null); }}><Feather name="x" size={24} color={theme.text} /></Pressable>
                        </View>

                        <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                            <ThemedText type="bodySmall" secondary style={styles.sectionHeader}>Current Occupants</ThemedText>
                            {Array.isArray(roomStudents) && roomStudents.length > 0 ? (
                                roomStudents.map((s: any) => (
                                    <View key={s._id} style={[styles.occupantItem, { backgroundColor: theme.backgroundSecondary }]}>
                                        <View style={styles.occupantInfo}>
                                            <ThemedText type="body" style={{ fontWeight: '600' }}>{s.name}</ThemedText>
                                            <ThemedText type="caption" secondary>{s.registerId}</ThemedText>
                                        </View>
                                        <Pressable onPress={() => { setShiftingStudent(s); setShowShiftModal(true); }} style={styles.actionIconButton}>
                                            <Feather name="refresh-cw" size={18} color={Colors.primary.main} />
                                        </Pressable>
                                    </View>
                                ))
                            ) : (
                                <ThemedText type="caption" style={styles.emptyText}>No students in this room</ThemedText>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Quick Shift Modal */}
            <Modal visible={showShiftModal} transparent animationType="fade" onRequestClose={() => setShowShiftModal(false)}>
                <View style={styles.modalOverlayCenter}>
                    <Animated.View entering={ZoomIn} style={[styles.shiftCard, { backgroundColor: theme.backgroundRoot }]}>
                        <View style={styles.modalHeader}>
                            <View>
                                <ThemedText type="h3">Shift Student</ThemedText>
                                <ThemedText type="caption" secondary>{shiftingStudent?.name}</ThemedText>
                            </View>
                            <Pressable onPress={() => setShowShiftModal(false)}><Feather name="x" size={24} color={theme.text} /></Pressable>
                        </View>
                        <View style={{ gap: 16 }}>
                            <ThemedText type="bodySmall" secondary>Enter room number to shift to:</ThemedText>
                            <TextInput
                                style={[styles.modalInput, { backgroundColor: theme.backgroundSecondary, color: theme.text }]}
                                value={targetRoomInput}
                                onChangeText={setTargetRoomInput}
                                placeholder="e.g. A102"
                                placeholderTextColor={theme.textSecondary}
                                autoCapitalize="characters"
                            />
                            <Button onPress={handleShiftStudent} loading={allotMutation.isPending} fullWidth>
                                Shift Now
                            </Button>
                        </View>
                    </Animated.View>
                </View>
            </Modal>

            {/* Add Room Modal */}
            <Modal visible={showAddRoomModal} transparent animationType="slide" onRequestClose={() => setShowAddRoomModal(false)}>
                <View style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowAddRoomModal(false)} />
                    <View style={[styles.modalContent, { backgroundColor: theme.backgroundRoot }]}>
                        <View style={styles.modalHeader}>
                            <ThemedText type="h3">Add New Room</ThemedText>
                            <Pressable onPress={() => setShowAddRoomModal(false)}><Feather name="x" size={24} color={theme.text} /></Pressable>
                        </View>
                        <View style={{ gap: 16 }}>
                            <TextInput
                                style={[styles.modalInput, { backgroundColor: theme.backgroundSecondary, color: theme.text }]}
                                value={newRoomNumber}
                                onChangeText={setNewRoomNumber}
                                placeholder="Room Number"
                                placeholderTextColor={theme.textSecondary}
                            />
                            <TextInput
                                style={[styles.modalInput, { backgroundColor: theme.backgroundSecondary, color: theme.text }]}
                                value={newCapacity}
                                onChangeText={setNewCapacity}
                                keyboardType="numeric"
                                placeholder="Capacity (Default 4)"
                                placeholderTextColor={theme.textSecondary}
                            />
                            <Button onPress={handleAddRoom} loading={addRoomMutation.isPending} fullWidth>Create Room</Button>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Hostel Modal */}
            <Modal visible={showHostelModal} transparent animationType="slide" onRequestClose={() => setShowHostelModal(false)}>
                <View style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowHostelModal(false)} />
                    <View style={[styles.modalContent, { backgroundColor: theme.backgroundRoot }]}>
                        <View style={styles.modalHeader}>
                            <ThemedText type="h3">Select Hostel</ThemedText>
                            <Pressable onPress={() => setShowHostelModal(false)}><Feather name="x" size={24} color={theme.text} /></Pressable>
                        </View>
                        <ScrollView style={{ maxHeight: 300 }}>
                            {HOSTEL_BLOCKS.map((h) => (
                                <Pressable key={h} style={styles.modalItem} onPress={() => { setSelectedHostel(h); setShowHostelModal(false); }}>
                                    <ThemedText style={{ color: selectedHostel === h ? Colors.primary.main : theme.text }}>{h}</ThemedText>
                                    {selectedHostel === h && <Feather name="check" size={20} color={Colors.primary.main} />}
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <BrandedLoadingOverlay visible={isLoading} />
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { paddingHorizontal: Spacing.lg },
    header: { marginBottom: Spacing.xl, alignItems: 'center', gap: Spacing.md },
    title: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
    hostelSelectorButton: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: BorderRadius.full, backgroundColor: 'rgba(255,255,255,0.1)' },
    blockSelector: { marginBottom: Spacing.xl },
    blockRow: { gap: Spacing.sm },
    blockButton: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: BorderRadius.md, minWidth: 100, alignItems: "center" },
    statsRow: { flexDirection: "row", gap: Spacing.md, marginBottom: Spacing.xxl },
    statCard: { flex: 1, padding: Spacing.lg, borderRadius: BorderRadius.lg, alignItems: "center", backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    statNumber: { fontSize: 32, fontWeight: '800' },
    roomGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: 'flex-start' },
    roomCardContainer: { width: '25%', padding: Spacing.xs },
    roomCard: { width: "100%", paddingVertical: Spacing.lg, borderRadius: BorderRadius.lg, borderWidth: 1.5, alignItems: "center", backgroundColor: 'rgba(255,255,255,0.05)' },
    roomNumber: { fontSize: 20, fontWeight: '800' },
    occupancyRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    fab: { position: 'absolute', right: Spacing.xl, width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', ...Shadows.fab },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: Spacing.xl },
    modalContent: { borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, padding: Spacing.xl },
    shiftCard: { borderRadius: BorderRadius.xl, padding: Spacing.xl },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
    modalInput: { padding: Spacing.md, borderRadius: BorderRadius.md, fontSize: 16 },
    modalScroll: { flex: 1 },
    sectionHeader: { marginBottom: Spacing.md, fontWeight: '700', fontSize: 12, opacity: 0.6 },
    occupantItem: { flexDirection: 'row', padding: Spacing.lg, borderRadius: BorderRadius.lg, marginBottom: Spacing.sm, alignItems: 'center' },
    occupantInfo: { flex: 1 },
    allotItem: { flexDirection: 'row', padding: Spacing.lg, borderRadius: BorderRadius.lg, marginBottom: Spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(37,99,235,0.3)' },
    emptyText: { textAlign: 'center', padding: Spacing.xl, opacity: 0.4 },
    actionIconButton: { padding: Spacing.sm },
    modalItem: { padding: Spacing.xl, flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
});
