import React, { useState, useMemo } from "react";
import { StyleSheet, View, FlatList, Pressable, TextInput, RefreshControl, Linking, Alert, Platform } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Animated, { FadeInDown, FadeInRight, Layout } from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { FloatingBackground } from "@/components/FloatingBackground";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { EmptyState } from "@/components/EmptyState";

export default function StudentManagementScreen() {
    const { theme } = useTheme();
    const headerHeight = useHeaderHeight();
    const [searchQuery, setSearchQuery] = useState("");

    const { data: students, isLoading, refetch, isRefetching } = useQuery({
        queryKey: ["/users"],
        staleTime: 60000,
    });

    const filteredStudents = useMemo(() => {
        let list = (students as any[] || []).filter(u => u.role === 'student');
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(u =>
                u.name?.toLowerCase().includes(q) ||
                u.registerId?.toLowerCase().includes(q) ||
                u.roomNumber?.toString().includes(q) ||
                u.phone?.includes(q)
            );
        }
        return list.sort((a, b) => (a.roomNumber || 0) - (b.roomNumber || 0));
    }, [students, searchQuery]);

    const handleCall = (phone: string) => {
        if (!phone) return;
        Linking.openURL(`tel:${phone}`).catch(() => {
            Alert.alert("Error", "Unable to open dialer");
        });
    };

    const renderStudentCard = ({ item, index }: { item: any, index: number }) => (
        <Animated.View
            entering={FadeInRight.delay(index * 50).springify()}
            layout={Layout.springify()}
            style={[styles.card, { backgroundColor: theme.backgroundSecondary }]}
        >
            <View style={styles.cardHeader}>
                <View style={styles.nameContainer}>
                    <View style={[styles.avatar, { backgroundColor: Colors.primary.main + '15' }]}>
                        <ThemedText style={{ color: Colors.primary.main, fontWeight: '800' }}>
                            {item.name?.charAt(0).toUpperCase()}
                        </ThemedText>
                    </View>
                    <View>
                        <ThemedText type="body" style={{ fontWeight: '700' }}>{item.name}</ThemedText>
                        <ThemedText type="caption" secondary>{item.registerId}</ThemedText>
                    </View>
                </View>
                <View style={[styles.roomBadge, { backgroundColor: Colors.secondary.main + '15' }]}>
                    <ThemedText type="caption" style={{ color: Colors.secondary.main, fontWeight: '800' }}>
                        ROOM {item.roomNumber || "N/A"}
                    </ThemedText>
                </View>
            </View>

            <View style={styles.cardDivider} />

            <View style={styles.cardActions}>
                <View style={styles.infoItem}>
                    <Feather name="phone" size={14} color={theme.textSecondary} />
                    <ThemedText type="caption" style={{ marginLeft: 6 }}>{item.phone || "No phone"}</ThemedText>
                </View>
                <Pressable
                    style={({ pressed }) => [
                        styles.callBtn,
                        { backgroundColor: Colors.status.success + (pressed ? '30' : '15') }
                    ]}
                    onPress={() => handleCall(item.phone)}
                >
                    <Feather name="phone-call" size={16} color={Colors.status.success} />
                    <ThemedText type="caption" style={{ color: Colors.status.success, fontWeight: '700', marginLeft: 6 }}>Call</ThemedText>
                </Pressable>
            </View>
        </Animated.View>
    );

    return (
        <ThemedView style={styles.container}>
            <FloatingBackground primaryColor={Colors.primary.main} secondaryColor={Colors.secondary.main} />

            <View style={[styles.searchSection, { paddingTop: headerHeight + Spacing.md }]}>
                <View style={[styles.searchBar, { backgroundColor: theme.backgroundSecondary }]}>
                    <Feather name="search" size={20} color={theme.textSecondary} />
                    <TextInput
                        placeholder="Search name, ID, room or phone..."
                        placeholderTextColor={theme.textSecondary + '80'}
                        style={[styles.searchInput, { color: theme.text }]}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        autoFocus={false}
                    />
                    {searchQuery.length > 0 && (
                        <Pressable
                            onPress={() => setSearchQuery("")}
                            accessibilityRole="button"
                            accessibilityLabel="Clear search"
                            hitSlop={8}
                            android_ripple={{ color: "rgba(0,0,0,0.08)", borderless: true }}
                        >
                            <Feather name="x-circle" size={18} color={theme.textSecondary} />
                        </Pressable>
                    )}
                </View>
            </View>

            <FlatList
                data={filteredStudents}
                keyExtractor={(item) => item._id}
                renderItem={renderStudentCard}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                refreshControl={
                    <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary.main} />
                }
                ListEmptyComponent={
                    !isLoading ? (
                        <EmptyState title="No students found" subtitle="Try changing the search query." icon="users" />
                    ) : null
                }
            />

            <LoadingOverlay visible={isLoading && !isRefetching} message="Fetching student roster..." icon="users" color={Colors.primary.main} />
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    searchSection: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.md,
        zIndex: 1,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        height: 52,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        ...Shadows.card
    },
    searchInput: { flex: 1, marginLeft: 12, fontWeight: '600', fontSize: 15 },
    listContent: { padding: Spacing.lg, paddingBottom: 100 },
    card: {
        padding: 16,
        borderRadius: BorderRadius.md,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        ...Shadows.card
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    nameContainer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center'
    },
    roomBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12
    },
    cardDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
        marginVertical: 12
    },
    cardActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    infoItem: { flexDirection: 'row', alignItems: 'center' },
    callBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8
    },
    emptyState: { padding: 80, alignItems: 'center', justifyContent: 'center' }
});
