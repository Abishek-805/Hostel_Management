import React from "react";
import { StyleSheet, View, ScrollView, RefreshControl } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { FloatingBackground } from "@/components/FloatingBackground";
import { LoadingOverlay } from "@/components/LoadingOverlay";

export default function MealAnalyticsScreen() {
    const headerHeight = useHeaderHeight();
    const tabBarHeight = useBottomTabBarHeight();
    const { theme } = useTheme();
    const { user } = useAuth();

    const { data: analytics, isLoading, refetch } = useQuery({
        queryKey: ['/meal-ratings/analytics', user?.hostelBlock],
        enabled: !!user?.hostelBlock,
    });

    const ratingStats = (analytics as any) || { breakfast: 0, lunch: 0, dinner: 0, totalRatings: 0 };

    const RatingCard = ({ title, rating, icon, color }: any) => (
        <View style={[styles.analyticsCard, { backgroundColor: theme.backgroundSecondary }]}>
            <View style={[styles.iconBox, { backgroundColor: color + '20' }]}>
                <Feather name={icon} size={24} color={color} />
            </View>
            <View style={{ flex: 1 }}>
                <ThemedText type="bodySmall" secondary>{title}</ThemedText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ThemedText type="h1" style={{ color: theme.text }}>{Number(rating).toFixed(1)}</ThemedText>
                    <View style={{ flexDirection: 'row' }}>
                        {[1, 2, 3, 4, 5].map((star) => (
                            <Feather
                                key={star}
                                name="star"
                                size={14}
                                color={star <= Math.round(rating) ? "#FFD700" : theme.textSecondary + '40'}
                                style={{ marginRight: 2 }}
                            />
                        ))}
                    </View>
                </View>
            </View>
        </View>
    );

    return (
        <ThemedView style={styles.container}>
            <FloatingBackground primaryColor={Colors.primary.main} secondaryColor={Colors.secondary.main} />

            <ScrollView
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingTop: headerHeight + Spacing.lg, paddingBottom: tabBarHeight + 100 },
                ]}
                refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={Colors.primary.main} />}
            >
                <Animated.View entering={FadeInDown.delay(100)} style={styles.headerSection}>
                    <ThemedText type="h1">Meal Analytics</ThemedText>
                    <ThemedText type="bodySmall" secondary>Student feedback and satisfaction levels</ThemedText>
                </Animated.View>

                <View style={styles.grid}>
                    <RatingCard
                        title="Breakfast Quality"
                        rating={ratingStats.breakfast}
                        icon="sunrise"
                        color={Colors.status.warning}
                    />
                    <RatingCard
                        title="Lunch Quality"
                        rating={ratingStats.lunch}
                        icon="sun"
                        color={Colors.primary.main}
                    />
                    <RatingCard
                        title="Dinner Quality"
                        rating={ratingStats.dinner}
                        icon="moon"
                        color={Colors.secondary.main}
                    />
                </View>

                <View style={[styles.detailCard, { backgroundColor: theme.backgroundSecondary }]}>
                    <Feather name="bar-chart-2" size={20} color={theme.textSecondary} />
                    <ThemedText type="bodySmall" secondary>Based on {ratingStats.totalRatings} total reviews from students in {user?.hostelBlock}</ThemedText>
                </View>

            </ScrollView>

            <LoadingOverlay visible={isLoading} message="Analyzing feedback..." icon="trending-up" />
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { paddingHorizontal: Spacing.lg },
    headerSection: { marginBottom: Spacing.xl },
    grid: { gap: Spacing.md },
    analyticsCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.xl,
        borderRadius: BorderRadius.md,
        ...Shadows.card,
        gap: Spacing.lg
    },
    iconBox: {
        width: 60,
        height: 60,
        borderRadius: BorderRadius.sm,
        justifyContent: 'center',
        alignItems: 'center'
    },
    detailCard: {
        marginTop: Spacing.xl,
        padding: Spacing.lg,
        borderRadius: BorderRadius.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        opacity: 0.8
    }
});
