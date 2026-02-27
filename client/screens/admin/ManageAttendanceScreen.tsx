import React, { useState, useMemo } from "react";
import { StyleSheet, View, ScrollView, Pressable, FlatList, Alert, Platform, Dimensions, TextInput, RefreshControl, Image } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { File, Paths } from 'expo-file-system';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, { FadeInDown, FadeInRight, FadeInUp, Layout, ZoomIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { buildApiUrl } from "@/config/api";
import { FloatingBackground } from "@/components/FloatingBackground";
import { BrandedLoadingOverlay } from "@/components/BrandedLoadingOverlay";

const { width } = Dimensions.get('window');

const SessionPhoto = ({ record, label }: { record: any, label: string }) => {
  return (
    <View style={styles.photoContainer}>
      {record?.photoUrl ? (
        <Image source={{ uri: record.photoUrl }} style={styles.sessionPhoto} />
      ) : (
        <View style={[styles.photoPlaceholder, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
          <ThemedText style={styles.placeholderLabel}>{label}</ThemedText>
        </View>
      )}
    </View>
  );
};

const StatusMini = ({ status, label }: { status: string, label: string }) => {
  const color = status === 'present' ? Colors.status.success :
    status === 'leave' ? Colors.status.warning :
      status === 'holiday' ? Colors.secondary.main :
        status === 'absent' ? Colors.status.error : 'rgba(255,255,255,0.2)';

  return (
    <View style={styles.statusMiniRow}>
      <View style={[styles.statusMiniDot, { backgroundColor: color }]} />
      <ThemedText type="caption" style={[styles.statusMiniText, { color }]}>
        {label}: {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Absent'}
      </ThemedText>
    </View>
  );
};

const StatItem = ({ icon, label, value, color }: { icon: keyof typeof Feather.glyphMap, label: string, value: number | string, color: string }) => {
  return (
    <View style={styles.miniStat}>
      <View style={[styles.miniStatIcon, { backgroundColor: color + '15' }]}>
        <Feather name={icon} size={14} color={color} />
      </View>
      <View>
        <ThemedText style={styles.miniStatValue}>{value}</ThemedText>
        <ThemedText type="caption" style={styles.miniStatLabel}>{label}</ThemedText>
      </View>
    </View>
  );
};

export default function ManageAttendanceScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();

  const [isExporting, setIsExporting] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [sessionFilter, setSessionFilter] = useState<'all' | 'morning' | 'afternoon'>('all');
  const [searchQuery, setSearchQuery] = useState("");

  const dateString = selectedDate.toISOString().split('T')[0];

  const { data: attendanceData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['/attendance/date', dateString],
    staleTime: 0,
  });

  const getDates = () => {
    const dates = [];
    for (let i = -14; i <= 0; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      dates.push(date);
    }
    return dates.reverse();
  };

  const formatDate = (date: Date) => ({
    day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()],
    date: date.getDate(),
    isToday: date.toDateString() === new Date().toDateString()
  });

  const groupedAttendances = useMemo(() => {
    let list = (attendanceData as any[] || []);

    // Apply Session Filter
    if (sessionFilter !== 'all') {
      list = list.filter(a => a.session === sessionFilter);
    }

    // Apply Search Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(a =>
        (a.userId?.name?.toLowerCase().includes(q)) ||
        (a.userId?.registerId?.toLowerCase().includes(q)) ||
        (a.userId?.roomNumber?.toString().includes(q))
      );
    }

    // Group by student
    const groups: Record<string, any> = {};
    list.forEach(record => {
      const studentId = record.userId?._id || record.id;
      if (!groups[studentId]) {
        groups[studentId] = {
          user: record.userId,
          morning: null,
          afternoon: null
        };
      }
      if (record.session === 'morning') groups[studentId].morning = record;
      if (record.session === 'afternoon') groups[studentId].afternoon = record;
    });

    return Object.values(groups);
  }, [attendanceData, sessionFilter, searchQuery]);

  const stats = useMemo(() => {
    const list = (attendanceData as any[] || []);
    // Global stats always reflect the selected day (ignoring search but respecting session)
    const baseList = sessionFilter === 'all' ? list : list.filter(a => a.session === sessionFilter);
    return {
      present: baseList.filter(a => a.status === 'present').length,
      absent: baseList.filter(a => a.status === 'absent').length,
      total: baseList.length
    };
  }, [attendanceData, sessionFilter]);

  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      const token = await AsyncStorage.getItem("@hostelease_token");
      const exportUrl = `${buildApiUrl("/attendances/export-excel")}?t=${Date.now()}`;

      // Web: Direct browser download
      if (Platform.OS === 'web') {
        const response = await fetch(exportUrl, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Attendance_Summary_${dateString}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        return;
      }

      // Mobile: Download and save to device storage using new SDK 54 File API
      const fileName = `Attendance_Summary_${dateString}.xlsx`;

      try {
        // Fetch file from backend
        const response = await fetch(exportUrl, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: Failed to download report`);
        }

        const blob = await response.blob();

        // Convert to base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result?.toString().split(',')[1] || '');
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        // Create file using new SDK 54 API
        const file = new File(Paths.document, fileName);
        await file.write(base64, {
          encoding: 'base64',
        });

        // Platform-specific handling
        if (Platform.OS === 'android') {
          const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
          if (!permissions.granted) {
            Alert.alert("Permission required", "Please choose a folder to save the report.");
            return;
          }

          const uri = await StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            fileName,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          );

          await StorageAccessFramework.writeAsStringAsync(uri, base64, {
            encoding: 'base64',
          });

          Alert.alert("Saved successfully", "Attendance report saved.");
        } else if (Platform.OS === 'ios') {
          // iOS: Use share sheet
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(file.uri, {
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              dialogTitle: 'Share Attendance Report',
            });
            Alert.alert("Success", "Attendance report exported!");
          } else {
            Alert.alert("Success", "File saved to device storage.");
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        Alert.alert("Export failed", errorMsg || "Failed to download report.");
      }
    } catch (error) {
      Alert.alert("Export failed", "An unexpected error occurred while exporting.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <FloatingBackground primaryColor={Colors.primary.main} secondaryColor={Colors.secondary.main} />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: headerHeight + Spacing.sm, paddingBottom: tabBarHeight + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary.main} />
        }
      >
        {/* Modern Header View */}
        <Animated.View entering={FadeInDown.duration(600)} style={styles.modernHeader}>
          <View style={styles.headerTop}>
            <View>
              <ThemedText type="h1">Attendance</ThemedText>
              <ThemedText type="bodySmall" secondary>Daily monitoring dashboard</ThemedText>
            </View>
            <Pressable
              style={({ pressed }) => [styles.exportBtn, pressed && { transform: [{ scale: 0.95 }] }]}
              onPress={handleExportExcel}
              disabled={isExporting}
            >
              <LinearGradient
                colors={[Colors.primary.main, Colors.primary.light]}
                style={styles.exportGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Feather name={isExporting ? "loader" : "file-text"} size={16} color="#FFF" />
                <ThemedText type="caption" style={styles.exportBtnText}>Report</ThemedText>
              </LinearGradient>
            </Pressable>
          </View>

          {/* Integrated Statistics Hub */}
          <View style={[styles.statsHub, Shadows.card]}>
            <StatItem icon="check" label="Present" value={stats.present} color={Colors.status.success} />
            <View style={styles.statDivider} />
            <StatItem icon="x" label="Absent" value={stats.absent} color={Colors.status.error} />
            <View style={styles.statDivider} />
            <StatItem icon="activity" label="Rate" value={stats.total > 0 ? Math.round((stats.present / stats.total) * 100) + '%' : '0%'} color={Colors.secondary.main} />
          </View>
        </Animated.View>

        {/* Improved Search Bar */}
        <Animated.View entering={FadeInUp.delay(300).duration(500)} style={styles.searchWrapper}>
          <View style={styles.searchBar}>
            <Feather name="search" size={18} color="rgba(255,255,255,0.4)" />
            <TextInput
              placeholder="Search by name, ID or room..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery("")}>
                <Feather name="x-circle" size={16} color="rgba(255,255,255,0.4)" />
              </Pressable>
            )}
          </View>
        </Animated.View>

        {/* Date Selector */}
        <Animated.View entering={FadeInDown.delay(200)} style={styles.sectionContainer}>
          <ThemedText type="caption" style={styles.sectionLabel}>Date Selection</ThemedText>
          <FlatList
            horizontal
            data={getDates()}
            keyExtractor={(item) => item.toISOString()}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dateList}
            renderItem={({ item }) => {
              const { day, date, isToday } = formatDate(item);
              const isSelected = item.toDateString() === selectedDate.toDateString();
              return (
                <Pressable
                  style={[
                    styles.dateBtn,
                    isSelected && { backgroundColor: Colors.primary.main, borderColor: Colors.primary.main }
                  ]}
                  onPress={() => setSelectedDate(item)}
                >
                  <ThemedText type="caption" style={[styles.dateDay, isSelected && { color: "#FFF" }]}>{day}</ThemedText>
                  <ThemedText style={[styles.dateNumber, isSelected && { color: "#FFF" }]}>{date}</ThemedText>
                  {isToday && !isSelected && <View style={styles.todayDot} />}
                </Pressable>
              );
            }}
          />
        </Animated.View>

        {/* Filter Chips */}
        <Animated.View entering={FadeInDown.delay(400)} style={styles.filterContainer}>
          {(['all', 'morning', 'afternoon'] as const).map((s) => (
            <Pressable
              key={s}
              onPress={() => setSessionFilter(s)}
              style={[
                styles.chip,
                sessionFilter === s && styles.chipActive
              ]}
            >
              <ThemedText type="caption" style={[styles.chipText, sessionFilter === s && styles.chipTextActive]}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </ThemedText>
            </Pressable>
          ))}
        </Animated.View>

        {/* Roster List */}
        <View style={styles.listHeaderModern}>
          <ThemedText type="h3">Roster Details</ThemedText>
          <View style={styles.tagSmall}>
            <ThemedText type="caption" style={styles.tagSmallText}>{groupedAttendances.length} Students</ThemedText>
          </View>
        </View>

        <View style={styles.recordsListModern}>
          {groupedAttendances.length > 0 ? (
            groupedAttendances.map((group: any, index: number) => (
              <Animated.View
                key={group.user?._id || index}
                entering={FadeInRight.delay((index % 15) * 40)}
                layout={Layout.springify()}
                style={styles.studentCard}
              >
                <View style={styles.cardLeft}>
                  {/* Both photos side-by-side */}
                  <View style={styles.photosRow}>
                    <SessionPhoto record={group.morning} label="M" />
                    <SessionPhoto record={group.afternoon} label="A" />
                  </View>

                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.studentName} numberOfLines={1}>{group.user?.name || "Unknown Student"}</ThemedText>
                    <View style={styles.metaRow}>
                      <ThemedText style={styles.studentId}>{group.user?.registerId || "N/A"}</ThemedText>
                      <View style={styles.dotSeparator} />
                      <ThemedText style={styles.studentRoom}>RM {group.user?.roomNumber || "--"}</ThemedText>
                    </View>
                  </View>
                </View>

                {/* Simplified status badges */}
                <View style={styles.cardRightGroup}>
                  <StatusMini status={group.morning?.status} label="M" />
                  <StatusMini status={group.afternoon?.status} label="A" />
                </View>
              </Animated.View>
            ))
          ) : (
            <Animated.View entering={ZoomIn} style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Feather name="user-x" size={32} color="rgba(255,255,255,0.2)" />
              </View>
              <ThemedText style={styles.emptyText}>No results found</ThemedText>
              <ThemedText style={styles.emptySub}>Try adjusting your search or filters</ThemedText>
            </Animated.View>
          )}
        </View>
      </ScrollView>

      <BrandedLoadingOverlay visible={isLoading && !isRefetching} message="Loading Roster..." icon="refresh-cw" color={Colors.primary.main} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg },

  // Modern Header
  modernHeader: { marginBottom: Spacing.xl },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: Spacing.lg },
  eyebrow: { fontSize: 11, fontWeight: '900', color: Colors.primary.main, letterSpacing: 1.5, marginBottom: 4 },
  headerTitle: { fontSize: 34, fontWeight: '900', letterSpacing: -1, color: '#FFF' },
  exportBtn: { borderRadius: BorderRadius.md, overflow: 'hidden', ...Shadows.card },
  exportGradient: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  exportBtnText: { color: '#FFF', fontWeight: '800' },

  // Stats Hub
  statsHub: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: BorderRadius.lg, padding: 18, alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  miniStat: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  miniStatIcon: { width: 36, height: 36, borderRadius: BorderRadius.sm, justifyContent: 'center', alignItems: 'center' },
  miniStatValue: { fontSize: 20, fontWeight: '800', color: '#FFF' },
  miniStatLabel: { color: 'rgba(255,255,255,0.5)' },
  statDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 6 },

  // Search Bar
  searchWrapper: { marginBottom: Spacing.xl },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, paddingHorizontal: 16, height: 50, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  searchInput: { flex: 1, marginLeft: 12, color: '#FFF', fontSize: 14, fontWeight: '600' },

  // Section
  sectionContainer: { marginBottom: Spacing.lg },
  sectionLabel: { color: 'rgba(255,255,255,0.5)', marginBottom: 8 },
  dateList: { gap: 10 },
  dateBtn: { width: 52, height: 70, borderRadius: BorderRadius.md, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  dateDay: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  dateNumber: { fontSize: 20, fontWeight: '700', color: '#FFF', marginTop: 2 },
  todayDot: { position: 'absolute', bottom: 8, width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.primary.main },

  // Chips
  filterContainer: { flexDirection: 'row', gap: 10, marginBottom: Spacing.xl },
  chip: { flex: 1, paddingVertical: 12, borderRadius: BorderRadius.md, backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  chipActive: { backgroundColor: 'rgba(37, 99, 235, 0.12)', borderColor: Colors.primary.main },
  chipText: { fontWeight: '700', color: 'rgba(255,255,255,0.4)' },
  chipTextActive: { color: Colors.primary.main },

  // List
  listHeaderModern: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  listTitleModern: { fontSize: 20, fontWeight: '800', color: '#FFF', letterSpacing: -0.5 },
  tagSmall: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.sm, backgroundColor: 'rgba(37, 99, 235, 0.1)' },
  tagSmallText: { fontWeight: '800', color: Colors.primary.main },

  // Student Cards
  recordsListModern: { gap: 10 },
  studentCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', ...Shadows.card },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  photosRow: { flexDirection: 'row', gap: 6, marginRight: 12 },
  photoContainer: { width: 42, height: 42, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  sessionPhoto: { width: '100%', height: '100%' },
  photoPlaceholder: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  placeholderLabel: { fontSize: 10, fontWeight: '800', color: '#FFF', opacity: 0.2 },

  studentName: { fontSize: 15, fontWeight: '800', color: '#FFF' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  studentId: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)' },
  dotSeparator: { width: 3, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 6 },
  studentRoom: { fontSize: 10, fontWeight: '800', color: Colors.primary.main, opacity: 0.9 },

  cardRightGroup: { alignItems: 'flex-end', gap: 4, marginLeft: 8 },
  statusMiniRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusMiniDot: { width: 6, height: 6, borderRadius: 3 },
  statusMiniText: { fontWeight: '800', fontSize: 10, letterSpacing: 0.2 },

  emptyContainer: { paddingVertical: 80, alignItems: 'center', justifyContent: 'center' },
  emptyIconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.03)', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyText: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  emptySub: { color: 'rgba(255,255,255,0.3)', fontSize: 13, fontWeight: '600', marginTop: 4 },
});
