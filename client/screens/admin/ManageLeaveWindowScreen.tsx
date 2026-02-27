import React, { useState, useEffect } from "react";
import { StyleSheet, View, ScrollView, Pressable, TextInput, Alert, Platform } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, getQueryFn } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { FloatingBackground } from "@/components/FloatingBackground";
import { LoadingOverlay } from "@/components/LoadingOverlay";

export default function ManageLeaveWindowScreen() {
    const headerHeight = useHeaderHeight();
    const tabBarHeight = useBottomTabBarHeight();
    const { theme } = useTheme();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [label, setLabel] = useState("");
    const [fromDate, setFromDate] = useState(new Date());
    const [toDate, setToDate] = useState(new Date());
    const [showFromPicker, setShowFromPicker] = useState(false);
    const [showToPicker, setShowToPicker] = useState(false);

    const { data: settingsData, isLoading } = useQuery({
        queryKey: ['hostel-settings', user?.hostelBlock],
        queryFn: getQueryFn({ on401: 'throw' }),
        enabled: !!user?.hostelBlock,
    });

    const settings = settingsData as any;

    useEffect(() => {
        if (settings) {
            setLabel(settings.leaveWindowLabel || "");
            if (settings.leaveWindowFrom) setFromDate(new Date(settings.leaveWindowFrom));
            if (settings.leaveWindowTo) setToDate(new Date(settings.leaveWindowTo));
        }
    }, [settings]);

    const updateSettingsMutation = useMutation({
        mutationFn: async (data: any) => {
            const response = await apiRequest("PUT", `/hostel-settings/${user?.hostelBlock}`, data);
            if (!response.ok) throw new Error("Failed to update");
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['hostel-settings'] });
            Alert.alert("Success", "Holiday window updated successfully!");
        },
        onError: (error) => {
            Alert.alert("Error", error.message || "Failed to update holiday window");
        }
    });

    const handleSave = () => {
        if (!label.trim()) {
            Alert.alert("Error", "Please enter a label for this holiday (e.g., Summer Break)");
            return;
        }
        if (toDate < fromDate) {
            Alert.alert("Error", "End date cannot be before start date");
            return;
        }
        updateSettingsMutation.mutate({
            leaveWindowLabel: label.trim(),
            leaveWindowFrom: fromDate.toISOString(),
            leaveWindowTo: toDate.toISOString(),
        });
    };

    const handleClear = () => {
        updateSettingsMutation.mutate({
            leaveWindowLabel: "",
            leaveWindowFrom: null,
            leaveWindowTo: null,
        });
    };

    return (
        <ThemedView style={styles.container}>
            <FloatingBackground primaryColor={Colors.secondary.main} secondaryColor={Colors.primary.main} />
            <LoadingOverlay visible={isLoading} message="Fetching settings..." icon="settings" color={Colors.secondary.main} />

            {!isLoading && (
                <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: headerHeight + Spacing.lg, paddingBottom: tabBarHeight + 100 }]}>
                    <View style={[styles.card, { backgroundColor: theme.backgroundDefault }]}>
                        <ThemedText type="h3" style={styles.title}>Configure Holiday Window</ThemedText>
                        <ThemedText secondary style={styles.subtitle}>Set the official holiday dates for {user?.hostelBlock}. This will be visible to all students in your hostel.</ThemedText>
                        <View style={styles.form}>
                            <View style={styles.inputGroup}>
                                <ThemedText type="bodySmall" secondary style={styles.label}>Holiday Label</ThemedText>
                                <TextInput
                                    style={[styles.input, { backgroundColor: theme.backgroundSecondary, color: theme.text }]}
                                    placeholder="e.g. Christmas Vacation"
                                    placeholderTextColor={theme.textSecondary}
                                    value={label}
                                    onChangeText={setLabel}
                                />
                            </View>
                            <View style={styles.datePickerRow}>
                                <View style={styles.datePickerItem}>
                                    <ThemedText type="bodySmall" secondary style={styles.label}>Start Date</ThemedText>
                                    {Platform.OS === 'web' ? (
                                        <input
                                            type="date"
                                            style={{
                                                padding: '12px',
                                                backgroundColor: theme.backgroundSecondary,
                                                color: theme.text,
                                                borderRadius: BorderRadius.sm,
                                                borderWidth: 0,
                                                fontSize: '16px',
                                            }}
                                            value={fromDate.toISOString().split('T')[0]}
                                            onChange={(e) => setFromDate(new Date(e.target.value))}
                                        />
                                    ) : (
                                        <Pressable
                                            style={[styles.dateButton, { backgroundColor: theme.backgroundSecondary }]}
                                            onPress={() => setShowFromPicker(true)}
                                        >
                                            <Feather name="calendar" size={18} color={theme.text} />
                                            <ThemedText type="body">{fromDate.toLocaleDateString()}</ThemedText>
                                        </Pressable>
                                    )}
                                </View>
                                <View style={styles.datePickerItem}>
                                    <ThemedText type="bodySmall" secondary style={styles.label}>End Date</ThemedText>
                                    {Platform.OS === 'web' ? (
                                        <input
                                            type="date"
                                            style={{
                                                padding: '12px',
                                                backgroundColor: theme.backgroundSecondary,
                                                color: theme.text,
                                                borderRadius: BorderRadius.sm,
                                                borderWidth: 0,
                                                fontSize: '16px',
                                            }}
                                            value={toDate.toISOString().split('T')[0]}
                                            onChange={(e) => setToDate(new Date(e.target.value))}
                                        />
                                    ) : (
                                        <Pressable
                                            style={[styles.dateButton, { backgroundColor: theme.backgroundSecondary }]}
                                            onPress={() => setShowToPicker(true)}
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
                                        setShowFromPicker(false);
                                        if (date) setFromDate(date);
                                    }}
                                />
                            )}
                            {showToPicker && Platform.OS !== 'web' && (
                                <DateTimePicker
                                    value={toDate}
                                    mode="date"
                                    display="default"
                                    onChange={(event, date) => {
                                        setShowToPicker(false);
                                        if (date) setToDate(date);
                                    }}
                                    minimumDate={fromDate}
                                />
                            )}
                            <Button
                                onPress={handleSave}
                                loading={updateSettingsMutation.isPending}
                                style={{ marginTop: Spacing.xl }}
                                fullWidth
                            >
                                Update Holiday Session
                            </Button>
                            {settings?.leaveWindowLabel ? (
                                <Button
                                    onPress={handleClear}
                                    variant="outline"
                                    style={{ marginTop: Spacing.md, borderColor: Colors.status.error }}
                                    fullWidth
                                >
                                    <ThemedText style={{ color: Colors.status.error }}>Clear Holiday Info</ThemedText>
                                </Button>
                            ) : null}
                        </View>
                    </View>
                    <View style={[styles.previewCard, { backgroundColor: theme.backgroundSecondary }]}>
                        <ThemedText type="h3" style={{ marginBottom: Spacing.sm }}>Preview</ThemedText>
                        <ThemedText secondary>How students will see it:</ThemedText>
                        <View style={[styles.previewItem, { backgroundColor: theme.backgroundDefault }]}>
                            <View style={styles.previewHeader}>
                                <Feather name="info" size={20} color={Colors.primary.main} />
                                <ThemedText type="h3" style={{ flex: 1 }}>{label || "No Active Session"}</ThemedText>
                            </View>
                            {label.trim() ? (
                                <ThemedText type="body" secondary>
                                    Dates: {fromDate.toLocaleDateString()} - {toDate.toLocaleDateString()}
                                </ThemedText>
                            ) : (
                                <ThemedText type="caption" secondary>Enter a label and select dates to activate a session</ThemedText>
                            )}
                        </View>
                    </View>
                </ScrollView>
            )}
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    centered: { flex: 1, justifyContent: "center", alignItems: "center" },
    scrollContent: { padding: Spacing.lg, gap: Spacing.xl },
    card: { padding: Spacing.xl, borderRadius: BorderRadius.md, ...Shadows.card },
    title: { marginBottom: Spacing.xs },
    subtitle: { marginBottom: Spacing.xl },
    form: { gap: Spacing.lg },
    inputGroup: { gap: Spacing.sm },
    label: { marginLeft: 4 },
    input: { height: 50, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, fontSize: 16 },
    datePickerRow: { flexDirection: "row", gap: Spacing.md },
    datePickerItem: { flex: 1, gap: Spacing.sm },
    dateButton: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, padding: Spacing.md, height: 50, borderRadius: BorderRadius.sm },
    previewCard: { padding: Spacing.xl, borderRadius: BorderRadius.md, borderStyle: 'dashed', borderWidth: 1, borderColor: '#CCC' },
    previewItem: { marginTop: Spacing.md, padding: Spacing.lg, borderRadius: BorderRadius.sm, ...Shadows.card, gap: Spacing.sm },
    previewHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md }
});
