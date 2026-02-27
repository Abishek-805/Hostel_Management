import React, { useState } from "react";
import { StyleSheet, View, ScrollView, Pressable, Alert, Platform } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { FloatingBackground } from "@/components/FloatingBackground";
import { BrandedLoadingOverlay } from "@/components/BrandedLoadingOverlay";

type MealCategory = "breakfast" | "lunch" | "dinner" | "snacks";
const CATEGORIES: MealCategory[] = ["breakfast", "lunch", "dinner", "snacks"];

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_LABELS: Record<string, string> = {
    'sun': 'Sun', 'mon': 'Mon', 'tue': 'Tue', 'wed': 'Wed', 'thu': 'Thu', 'fri': 'Fri', 'sat': 'Sat'
};

export default function ManageSuggestionsScreen() {
    const headerHeight = useHeaderHeight();
    const tabBarHeight = useBottomTabBarHeight();
    const { theme } = useTheme();
    const { user } = useAuth();

    const [selectedCategory, setSelectedCategory] = useState<MealCategory>("breakfast");
    const [isExporting, setIsExporting] = useState(false);

    const { data: suggestions, isLoading, refetch } = useQuery({
        queryKey: ['menu-suggestions', `?hostelBlock=${user?.hostelBlock || ''}&week=current`],
        enabled: !!user?.hostelBlock,
    });

    const filteredSuggestions = (suggestions as any[])?.filter(s => s.category === selectedCategory) || [];

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const response = await apiRequest("GET", `/menu-suggestions/export/excel?t=${Date.now()}`);

            if (!response.ok) throw new Error("Export failed");

            // Web: Direct browser download
            if (Platform.OS === 'web') {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Menu_Suggestions_${user?.hostelBlock}.xlsx`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                return;
            }

            // Mobile: Save to device storage using new SDK 54 File API
            const blob = await response.blob();
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result?.toString().split(',')[1] || '');
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });

            const filename = `Menu_Suggestions_${user?.hostelBlock}.xlsx`;
            
            // Create file using new SDK 54 API
            const file = new File(Paths.document, filename);
            await file.write(base64, {
                encoding: 'base64',
            });

            // Platform-specific handling
            if (Platform.OS === 'android') {
                // Android: Direct save to Downloads folder
                try {
                    const { status } = await MediaLibrary.requestPermissionsAsync();
                    if (status === 'granted') {
                        const asset = await MediaLibrary.createAssetAsync(file.uri);
                        await MediaLibrary.createAlbumAsync("Download", asset, false);
                        Alert.alert("Success", "Menu suggestions saved to Downloads folder");
                    } else {
                        Alert.alert("Permission Denied", "Unable to save to Downloads. Grant storage permission in app settings.");
                    }
                } catch (mlError) {
                    console.error("[Export] MediaLibrary error:", mlError);
                    Alert.alert("Error", "Failed to save to Downloads folder");
                }
            } else if (Platform.OS === 'ios') {
                // iOS: Use share sheet
                if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(file.uri, {
                        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        dialogTitle: 'Share Menu Suggestions',
                    });
                    Alert.alert("Success", "Menu suggestions exported!");
                } else {
                    Alert.alert("Success", "File saved to device storage.");
                }
            }
        } catch (error) {
            console.error("[Export] Menu suggestions export failed:", error instanceof Error ? error.message : String(error));
            Alert.alert("Error", error instanceof Error ? error.message : "Failed to export suggestions");
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <ThemedView style={styles.container}>
            <FloatingBackground primaryColor={Colors.primary.main} secondaryColor={Colors.secondary.main} />

            <ScrollView
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingTop: headerHeight + Spacing.lg, paddingBottom: tabBarHeight + 100 },
                ]}
                showsVerticalScrollIndicator={false}
            >
                <Animated.View entering={FadeInDown.delay(100)} style={styles.headerSection}>
                    <ThemedText type="h1">Food Suggestions</ThemedText>
                    <ThemedText type="bodySmall" secondary>Top student requests for this week</ThemedText>

                    <Button
                        variant="primary"
                        onPress={handleExport}
                        loading={isExporting}
                        style={styles.exportBtn}
                    >
                        <Feather name="download" size={18} color="#FFF" />  Export Top 4 List
                    </Button>
                </Animated.View>

                {/* Category Tabs */}
                <View style={styles.categoryTabs}>
                    {CATEGORIES.map((cat) => (
                        <Pressable
                            key={cat}
                            style={[
                                styles.categoryTab,
                                {
                                    backgroundColor: selectedCategory === cat ? Colors.primary.main : theme.backgroundSecondary,
                                    borderColor: selectedCategory === cat ? Colors.primary.main : theme.border
                                }
                            ]}
                            onPress={() => setSelectedCategory(cat)}
                        >
                            <ThemedText
                                type="bodySmall"
                                style={{
                                    color: selectedCategory === cat ? "#FFF" : theme.text,
                                    fontWeight: 'bold',
                                    textTransform: 'capitalize'
                                }}
                            >
                                {cat}
                            </ThemedText>
                        </Pressable>
                    ))}
                </View>

                {/* Suggestions List */}
                <View style={styles.suggestionsList}>
                    {filteredSuggestions.length > 0 ? (
                        filteredSuggestions.map((s, index) => (
                            <Animated.View
                                key={s._id || index}
                                entering={FadeInRight.delay(index * 50)}
                                style={[styles.suggestionCard, { backgroundColor: theme.backgroundSecondary }]}
                            >
                                <View style={styles.suggestionMain}>
                                    <ThemedText type="h3" style={styles.dishName}>{s.dishName}</ThemedText>
                                    <View style={styles.suggestionDetails}>
                                        <View style={[styles.dayBadge, { backgroundColor: Colors.secondary.main + '20' }]}>
                                            <ThemedText type="caption" style={{ color: Colors.secondary.main, fontWeight: 'bold' }}>
                                                {DAY_LABELS[s.dayOfWeek || 'mon']?.toUpperCase()}
                                            </ThemedText>
                                        </View>
                                        <ThemedText type="caption" secondary>•  Suggested by {s.suggestedBy?.length || 1} rooms</ThemedText>
                                    </View>
                                </View>

                                <View style={[styles.voteCount, { backgroundColor: Colors.primary.main + '15' }]}>
                                    <Feather name="thumbs-up" size={14} color={Colors.primary.main} />
                                    <ThemedText type="h2" style={{ color: Colors.primary.main }}>{s.voteCount}</ThemedText>
                                </View>
                            </Animated.View>
                        ))
                    ) : (
                        <View style={styles.emptyState}>
                            <Feather name="inbox" size={48} color={theme.textSecondary} />
                            <ThemedText type="body" secondary style={{ marginTop: Spacing.md }}>
                                No suggestions found for this category
                            </ThemedText>
                        </View>
                    )}
                </View>
            </ScrollView>

            <BrandedLoadingOverlay visible={isLoading} message="Loading suggestions..." icon="book-open" />
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { paddingHorizontal: Spacing.lg },
    headerSection: { marginBottom: Spacing.xl },
    exportBtn: { marginTop: Spacing.lg, borderRadius: BorderRadius.md },
    categoryTabs: {
        flexDirection: 'row',
        gap: Spacing.sm,
        marginBottom: Spacing.xl,
        flexWrap: 'wrap'
    },
    categoryTab: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        minWidth: 80,
        alignItems: 'center'
    },
    suggestionsList: { gap: Spacing.md },
    suggestionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.lg,
        borderRadius: BorderRadius.md,
        ...Shadows.card
    },
    suggestionMain: { flex: 1 },
    dishName: { marginBottom: 4 },
    suggestionDetails: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    dayBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    voteCount: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.sm,
        alignItems: 'center',
        minWidth: 60
    },
    emptyState: {
        paddingVertical: 100,
        alignItems: 'center'
    }
});
