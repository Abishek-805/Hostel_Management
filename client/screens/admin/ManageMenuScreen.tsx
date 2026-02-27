import React, { useState, useRef, useEffect } from "react";
import { StyleSheet, View, ScrollView, Pressable, Modal, TextInput, Alert, FlatList, Switch, Animated as RNAnimated, Platform } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeInDown, FadeInRight, useSharedValue, withRepeat, withTiming, useAnimatedStyle, Easing } from 'react-native-reanimated';

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { FloatingBackground } from "@/components/FloatingBackground";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { AdminStackParamList } from "@/navigation/AdminTabNavigator";

type MealType = "breakfast" | "lunch" | "dinner";
type NavigationProp = NativeStackNavigationProp<AdminStackParamList>;

// Pulsing Icon Container
const PulsingIcon = ({ children, style }: { children: React.ReactNode, style: any }) => {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.05, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
};

// Blinking Dot Component
const BlinkingDot = ({
  color,
  duration = 1000,
  minOpacity = 0.3,
  maxOpacity = 1.0
}: {
  color: string,
  duration?: number,
  minOpacity?: number,
  maxOpacity?: number
}) => {
  const opacity = useRef(new RNAnimated.Value(minOpacity)).current;

  // React to prop changes by restarting the animation
  useEffect(() => {
    // Reset to initial value first to avoid jumps
    opacity.setValue(minOpacity);

    const animation = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(opacity, {
          toValue: maxOpacity,
          duration: duration / 2,
          useNativeDriver: Platform.OS !== 'web'
        }),
        RNAnimated.timing(opacity, {
          toValue: minOpacity,
          duration: duration / 2,
          useNativeDriver: Platform.OS !== 'web'
        }),
      ])
    );

    animation.start();

    return () => animation.stop();
  }, [duration, minOpacity, maxOpacity]);

  return <RNAnimated.View style={[styles.dot, { backgroundColor: color, opacity }]} />;
};

export default function ManageMenuScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const navigation = useNavigation<NavigationProp>();

  const { user } = useAuth(); // Need user for hostelBlock

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [mealType, setMealType] = useState<MealType>("breakfast");

  // Daily data structure for the modal
  const [dailyData, setDailyData] = useState<Record<MealType, {
    items: string;
    isSpecial: boolean;
    specialNote: string;
    isDefault: boolean;
    id: string | null;
  }>>({
    breakfast: { items: "", isSpecial: false, specialNote: "", isDefault: false, id: null },
    lunch: { items: "", isSpecial: false, specialNote: "", isDefault: false, id: null },
    dinner: { items: "", isSpecial: false, specialNote: "", isDefault: false, id: null },
  });

  const [isSpecial, setIsSpecial] = useState(false);
  const [specialNote, setSpecialNote] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // LIVE CLOCK State
  const [currentTime, setCurrentTime] = useState(new Date());

  // Timer to update status every minute
  useEffect(() => {
    // Update immediately on mount
    setCurrentTime(new Date());

    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // 1 minute

    return () => clearInterval(interval);
  }, []);

  // Helper to determine active state
  const getMealState = (type: MealType) => {
    const minutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    let isActive = false;
    let label = "Closed";

    // Default Inactive Config (Brighter than before, but still slower)
    let config = {
      duration: 2000,
      minOpacity: 0.4, // Increased from 0.2
      maxOpacity: 0.8, // Increased from 0.5
    };

    if (type === "breakfast") {
      // 7:30 (450) - 8:40 (520)
      if (minutes >= 450 && minutes <= 520) {
        isActive = true;
        label = "Serving";
      } else if (minutes >= 420 && minutes < 450) {
        label = "Prep";
      }
    } else if (type === "lunch") {
      // 12:15 (735) - 13:00 (780)
      if (minutes >= 735 && minutes <= 780) {
        isActive = true;
        label = "Serving";
      } else if (minutes >= 700 && minutes < 735) {
        label = "Prep";
      }
    } else if (type === "dinner") {
      // 19:30 (1170) - 20:30 (1230)
      if (minutes >= 1170 && minutes <= 1230) {
        isActive = true;
        label = "Serving";
      } else if (minutes >= 1140 && minutes < 1170) {
        label = "Prep";
      }
    }

    if (isActive) {
      // ACTIVE Config (Max Intensity, Fast Blink)
      config.duration = 400;
      config.minOpacity = 0.6; // Increased from 0.5
      config.maxOpacity = 1.0; // FULL Brightness
    }

    return { ...config, label };
  };

  const breakfastState = getMealState("breakfast");
  const lunchState = getMealState("lunch");
  const dinnerState = getMealState("dinner");

  const dateString = selectedDate.toISOString().split('T')[0];

  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);

  const { data: menuData, refetch, isLoading } = useQuery({
    queryKey: ['mess-menus', `${dateString}?hostelBlock=${user?.hostelBlock || ''}`],
    enabled: !!user?.hostelBlock
  });

  const { data: suggestions } = useQuery({
    queryKey: ['menu-suggestions', `?hostelBlock=${user?.hostelBlock || ''}&forDate=${dateString}`],
    enabled: !!user?.hostelBlock
  });

  const resetForm = () => {
    setMealType("breakfast");
    setDailyData({
      breakfast: { items: "", isSpecial: false, specialNote: "", isDefault: false, id: null },
      lunch: { items: "", isSpecial: false, specialNote: "", isDefault: false, id: null },
      dinner: { items: "", isSpecial: false, specialNote: "", isDefault: false, id: null },
    });
  };

  const handleOpenDayModal = (initialMeal: MealType = "breakfast") => {
    const newDailyData = {
      breakfast: { items: "", isSpecial: false, specialNote: "", isDefault: false, id: null },
      lunch: { items: "", isSpecial: false, specialNote: "", isDefault: false, id: null },
      dinner: { items: "", isSpecial: false, specialNote: "", isDefault: false, id: null },
    };

    menus.forEach((m: any) => {
      const itemsStr = m.menuItems?.map((i: any) => i.name).join(", ") || m.items || "";
      newDailyData[m.mealType as MealType] = {
        items: itemsStr,
        isSpecial: m.isSpecial || false,
        specialNote: m.specialNote || "",
        isDefault: m.isDefault || false,
        id: m._id
      };
    });

    setDailyData(newDailyData);
    setMealType(initialMeal);
    setShowModal(true);
  };

  const updateDailyField = (field: string, value: any) => {
    setDailyData(prev => ({
      ...prev,
      [mealType]: {
        ...prev[mealType],
        [field]: value
      }
    }));
  };

  const handleSubmit = async () => {
    if (!user?.hostelBlock) { Alert.alert("Error", "You are not assigned to a hostel"); return; }

    // Check if at least one meal has items
    const hasData = Object.values(dailyData).some(d => d.items.trim().length > 0);
    if (!hasData) {
      Alert.alert("Error", "Please enter menu items for at least one meal");
      return;
    }

    setIsSubmitting(true);
    try {
      const types: MealType[] = ["breakfast", "lunch", "dinner"];
      const promises = types.map(type => {
        const data = dailyData[type];
        if (!data.items.trim()) return null;

        const menuItemsArray = data.items.split(',').map(name => ({ name: name.trim() })).filter(i => i.name);
        const payload = {
          date: dateString,
          mealType: type,
          items: data.items.trim(),
          menuItems: menuItemsArray,
          isSpecial: data.isSpecial,
          specialNote: data.isSpecial ? data.specialNote : undefined,
          hostelBlock: user.hostelBlock,
          isDefault: data.isDefault,
          dayOfWeek: selectedDate.getDay()
        };

        if (data.id) {
          return apiRequest("PUT", `/mess-menus/${data.id}`, payload);
        } else {
          return apiRequest("POST", "/mess-menus", payload);
        }
      }).filter(p => p !== null);

      await Promise.all(promises);
      queryClient.invalidateQueries({ queryKey: ['mess-menus'] });
      setShowModal(false);
      resetForm();
      Alert.alert("Success", "Daily menu updated successfully!");
    } catch (error) {
      console.error("Submit error:", error);
      Alert.alert("Error", "Failed to update menu");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getDates = () => {
    const dates = [];
    for (let i = 0; i <= 14; i++) { const date = new Date(); date.setDate(date.getDate() + i); dates.push(date); }
    return dates;
  };

  const formatDate = (date: Date) => ({ day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()], date: date.getDate(), isToday: date.toDateString() === new Date().toDateString() });

  const menus = menuData as any[] || [];

  return (
    <ThemedView style={styles.container}>
      <FloatingBackground primaryColor={Colors.secondary.main} secondaryColor={Colors.primary.main} />
      <View style={[styles.headerBg, { backgroundColor: theme.backgroundSecondary, opacity: 0.5 }]} />

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: headerHeight + Spacing.lg, paddingBottom: tabBarHeight + 100 }]} showsVerticalScrollIndicator={false}>

        {/* Status Dashboard */}
        <Animated.View entering={FadeInDown.delay(100).springify()} style={[styles.statusDashboard, { backgroundColor: theme.backgroundDefault }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md }}>
            <ThemedText type="h3">Mess Status</ThemedText>
            <ThemedText type="caption" secondary>{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</ThemedText>
          </View>
          <View style={styles.statusRow}>
            {/* Breakfast Status */}
            <View style={[styles.statusBox, { backgroundColor: Colors.status.success + '10', borderColor: Colors.status.success + '20' }]}>
              <View style={styles.statusHeader}>
                <BlinkingDot
                  color={Colors.status.success}
                  duration={breakfastState.duration}
                  minOpacity={breakfastState.minOpacity}
                  maxOpacity={breakfastState.maxOpacity}
                />
                <ThemedText type="caption" style={{ color: Colors.status.success, fontWeight: '700' }}>{breakfastState.label}</ThemedText>
              </View>
              <ThemedText type="bodySmall" style={{ fontWeight: '600' }}>Breakfast</ThemedText>
            </View>

            {/* Lunch Status */}
            <View style={[styles.statusBox, { backgroundColor: Colors.status.warning + '10', borderColor: Colors.status.warning + '20' }]}>
              <View style={styles.statusHeader}>
                <BlinkingDot
                  color={Colors.status.warning}
                  duration={lunchState.duration}
                  minOpacity={lunchState.minOpacity}
                  maxOpacity={lunchState.maxOpacity}
                />
                <ThemedText type="caption" style={{ color: Colors.status.warning, fontWeight: '700' }}>{lunchState.label}</ThemedText>
              </View>
              <ThemedText type="bodySmall" style={{ fontWeight: '600' }}>Lunch</ThemedText>
            </View>

            {/* Dinner Status */}
            <View style={[styles.statusBox, { backgroundColor: Colors.status.error + '10', borderColor: Colors.status.error + '20' }]}>
              <View style={styles.statusHeader}>
                <BlinkingDot
                  color={Colors.status.error}
                  duration={dinnerState.duration}
                  minOpacity={dinnerState.minOpacity}
                  maxOpacity={dinnerState.maxOpacity}
                />
                <ThemedText type="caption" style={{ color: Colors.status.error, fontWeight: '700' }}>{dinnerState.label}</ThemedText>
              </View>
              <ThemedText type="bodySmall" style={{ fontWeight: '600' }}>Dinner</ThemedText>
            </View>
          </View>
        </Animated.View>

        <View style={{ height: Spacing.md }} />

        {/* Date Scroller */}
        <FlatList
          horizontal
          data={getDates()}
          keyExtractor={(item) => item.toISOString()}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateScroller}
          renderItem={({ item, index }) => {
            const { day, date, isToday } = formatDate(item);
            const isSelected = item.toDateString() === selectedDate.toDateString();
            return (
              <Animated.View entering={FadeInRight.delay(index * 50).springify()}>
                <Pressable style={[styles.dateItem, { backgroundColor: isSelected ? Colors.primary.main : theme.backgroundDefault }]} onPress={() => setSelectedDate(item)}>
                  <ThemedText type="caption" style={[styles.dateDay, { color: isSelected ? "#FFFFFF" : theme.textSecondary }]}>{day}</ThemedText>
                  <ThemedText type="h3" style={{ color: isSelected ? "#FFFFFF" : theme.text }}>{date}</ThemedText>
                  {isToday ? <View style={[styles.todayDot, { backgroundColor: isSelected ? "#FFFFFF" : Colors.primary.main }]} /> : null}
                </Pressable>
              </Animated.View>
            );
          }}
        />

        <ThemedText type="h3" style={styles.sectionTitle}>Menu for {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</ThemedText>

        {menus.length > 0 ? menus.map((menu: any, index: number) => (
          <Animated.View key={menu._id || menu.id || index} entering={FadeInDown.delay(index * 100).springify()} style={[styles.menuCard, { backgroundColor: theme.backgroundDefault }]}>
            <View style={styles.menuHeader}>
              <View style={styles.mealInfo}>
                <PulsingIcon style={[styles.mealIcon, { backgroundColor: Colors.primary.light + '20' }]}>
                  <Feather name={menu.mealType === "breakfast" ? "sunrise" : menu.mealType === "lunch" ? "sun" : "moon"} size={20} color={Colors.primary.main} />
                </PulsingIcon>
                <View>
                  <ThemedText type="body" style={styles.mealTitle}>{menu.mealType.charAt(0).toUpperCase() + menu.mealType.slice(1)}</ThemedText>
                  <ThemedText type="caption" secondary>07:00 AM - 09:00 AM</ThemedText>
                </View>
              </View>

              <View style={styles.menuActions}>
                {menu.isSpecial && (
                  <View style={styles.specialBadge}>
                    <BlinkingDot color="#fff" duration={600} />
                    <ThemedText type="caption" style={{ color: "#FFFFFF", fontWeight: 'bold' }}>SPECIAL</ThemedText>
                  </View>
                )}
                <Pressable onPress={() => handleOpenDayModal(menu.mealType)} style={styles.editBtn}>
                  <Feather name="edit-2" size={16} color={theme.text} />
                </Pressable>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <View style={styles.menuBody}>
              <ThemedText type="body" style={{ lineHeight: 24 }}>
                {menu.menuItems?.map((i: any) => i.name).join(', ') || menu.items}
              </ThemedText>
              {menu.specialNote ? (
                <View style={[styles.noteBox, { backgroundColor: Colors.status.warning + '10' }]}>
                  <Feather name="info" size={14} color={Colors.status.warning} />
                  <ThemedText type="caption" style={{ color: Colors.status.warning }}>{menu.specialNote}</ThemedText>
                </View>
              ) : null}
            </View>
          </Animated.View>
        )) : (
          <Animated.View entering={FadeInDown.delay(200)} style={[styles.emptyState, { backgroundColor: theme.backgroundDefault }]}>
            <Feather name="coffee" size={48} color={theme.textSecondary} />
            <ThemedText type="body" secondary style={styles.emptyText}>No menu planned for this date</ThemedText>
            <Button variant="outline" onPress={() => handleOpenDayModal()} style={{ marginTop: Spacing.md }}>Add Menu Now</Button>
          </Animated.View>
        )}

        {/* Quick Actions */}
        <Animated.View entering={FadeInDown.delay(300)} style={{ gap: Spacing.md, marginTop: Spacing.xl }}>
          <Pressable style={[styles.navCard, { backgroundColor: theme.backgroundDefault }]} onPress={() => navigation.navigate("FoodPoll")}>
            <View style={[styles.navIcon, { backgroundColor: Colors.status.success + "20" }]}><Feather name="bar-chart-2" size={24} color={Colors.status.success} /></View>
            <View style={styles.navContent}><ThemedText type="body" style={styles.navTitle}>Food Poll</ThemedText><ThemedText type="caption" secondary>Students vote on favorite dishes</ThemedText></View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
        </Animated.View>
      </ScrollView>

      <Pressable style={[styles.fab, { backgroundColor: Colors.primary.main }]} onPress={() => handleOpenDayModal()}>
        <Feather name="plus" size={24} color="#FFFFFF" />
      </Pressable>

      <Modal visible={showModal} animationType="fade" transparent onRequestClose={() => setShowModal(false)} accessibilityViewIsModal={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundRoot }]}>
            <View style={styles.modalHeader}>
              <View>
                <ThemedText type="h3">Daily Menu Editor</ThemedText>
                <ThemedText type="caption" secondary>{selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</ThemedText>
              </View>
              <Pressable onPress={() => setShowModal(false)} style={styles.closeBtn}>
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>
            <KeyboardAwareScrollViewCompat contentContainerStyle={styles.modalForm}>
              <ThemedText type="bodySmall" secondary style={styles.label}>Select Meal Type</ThemedText>
              <View style={styles.mealTabs}>
                {(["breakfast", "lunch", "dinner"] as MealType[]).map((meal) => (
                  <Pressable key={meal} style={[styles.mealTab, { backgroundColor: mealType === meal ? Colors.primary.main : theme.backgroundDefault, borderColor: mealType === meal ? Colors.primary.main : theme.border }]} onPress={() => setMealType(meal)}>
                    <Feather name={meal === "breakfast" ? "sunrise" : meal === "lunch" ? "sun" : "moon"} size={16} color={mealType === meal ? "#FFFFFF" : theme.textSecondary} style={{ marginBottom: 4 }} />
                    <ThemedText type="bodySmall" style={{ color: mealType === meal ? "#FFFFFF" : theme.text, fontWeight: '600' }}>{meal.charAt(0).toUpperCase() + meal.slice(1)}</ThemedText>
                  </Pressable>
                ))}
              </View>

              <ThemedText type="bodySmall" secondary style={styles.label}>Items Included in {mealType.charAt(0).toUpperCase() + mealType.slice(1)}</ThemedText>
              <TextInput
                style={[styles.textArea, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: theme.border, borderWidth: 1 }]}
                placeholder="e.g., Rice, Dal, Paneer Butter Masala, Roti, Salad..."
                placeholderTextColor={theme.textSecondary}
                value={dailyData[mealType].items}
                onChangeText={(v) => updateDailyField("items", v)}
                multiline
                numberOfLines={4}
              />

              <View style={styles.switchContainer}>
                <View style={{ flex: 1 }}>
                  <ThemedText type="body" style={{ fontWeight: '600' }}>Special Menu</ThemedText>
                  <ThemedText type="caption" secondary>For festivals or special occasions</ThemedText>
                </View>
                <Switch
                  value={dailyData[mealType].isSpecial}
                  onValueChange={(v) => updateDailyField("isSpecial", v)}
                  trackColor={{ true: Colors.primary.main }}
                />
              </View>

              {dailyData[mealType].isSpecial && (
                <Animated.View entering={FadeInDown.springify()}>
                  <ThemedText type="bodySmall" secondary style={styles.label}>Special Occasion Note</ThemedText>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: theme.border, borderWidth: 1 }]}
                    placeholder="e.g., Diwali Special, Trustees Visit"
                    placeholderTextColor={theme.textSecondary}
                    value={dailyData[mealType].specialNote}
                    onChangeText={(v) => updateDailyField("specialNote", v)}
                  />
                </Animated.View>
              )}

              <View style={styles.switchContainer}>
                <View style={{ flex: 1 }}>
                  <ThemedText type="body" style={{ fontWeight: '600' }}>Set as Weekly Default</ThemedText>
                  <ThemedText type="caption" secondary>Use this menu for every {selectedDate.toLocaleDateString('en-US', { weekday: 'long' })}</ThemedText>
                </View>
                <Switch
                  value={dailyData[mealType].isDefault}
                  onValueChange={(v) => updateDailyField("isDefault", v)}
                  trackColor={{ true: Colors.secondary.main }}
                />
              </View>

              <View style={{ marginTop: Spacing.lg }}>
                <Button
                  onPress={handleSubmit}
                  loading={isSubmitting}
                  fullWidth
                >
                  Save All Changes
                </Button>
              </View>
            </KeyboardAwareScrollViewCompat>
          </View>
        </View>
      </Modal>
      <LoadingOverlay visible={isLoading || isSubmitting} message={isSubmitting ? "Updating menus..." : "Fetching menu details..."} icon="coffee" color={Colors.secondary.main} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 200 },
  scrollContent: { paddingHorizontal: Spacing.lg },
  statusDashboard: { padding: Spacing.lg, borderRadius: BorderRadius.md, marginBottom: Spacing.md, ...Shadows.card },
  statusRow: { flexDirection: 'row', gap: Spacing.sm },
  statusBox: { flex: 1, padding: Spacing.sm, borderRadius: BorderRadius.sm, borderWidth: 1, alignItems: 'center' },
  statusHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dateScroller: { paddingBottom: Spacing.lg, gap: Spacing.sm },
  dateItem: { width: 60, height: 85, borderRadius: BorderRadius.md, alignItems: "center", justifyContent: "center", ...Shadows.card },
  dateDay: { marginBottom: Spacing.xs, fontWeight: '600' },
  todayDot: { width: 6, height: 6, borderRadius: 3, marginTop: Spacing.xs },
  sectionTitle: { marginBottom: Spacing.md, marginTop: Spacing.md, fontWeight: '700' },
  menuCard: { padding: 0, borderRadius: BorderRadius.md, marginBottom: Spacing.md, ...Shadows.card, overflow: 'hidden' },
  menuHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: Spacing.md },
  mealInfo: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  mealIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  mealTitle: { fontWeight: "700", fontSize: 16 },
  menuActions: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  specialBadge: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.primary.main, paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.full, gap: 6 },
  editBtn: { padding: 8, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.05)' },
  divider: { height: 1, opacity: 0.5 },
  menuBody: { padding: Spacing.md },
  noteBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: Spacing.md, padding: Spacing.sm, borderRadius: BorderRadius.sm },
  emptyState: { padding: Spacing.xxl, borderRadius: BorderRadius.md, alignItems: "center", marginTop: Spacing.lg },
  emptyText: { marginTop: Spacing.md, marginBottom: Spacing.md },
  navSection: { marginTop: Spacing.lg, gap: Spacing.md },
  navCard: { flexDirection: "row", alignItems: "center", padding: Spacing.md, borderRadius: BorderRadius.md, ...Shadows.card },
  navIcon: { width: 48, height: 48, borderRadius: BorderRadius.sm, justifyContent: "center", alignItems: "center" },
  navContent: { flex: 1, marginLeft: Spacing.md },
  navTitle: { fontWeight: "600" },
  suggestionCard: { flexDirection: "row", alignItems: "center", padding: Spacing.md, borderRadius: BorderRadius.sm, marginBottom: Spacing.sm, ...Shadows.card },
  suggestionContent: { flex: 1 },
  voteBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  fab: { position: "absolute", right: Spacing.lg, bottom: Spacing.tabBarHeight + Spacing.xl, width: 56, height: 56, borderRadius: 28, justifyContent: "center", alignItems: "center", ...Shadows.fab, elevation: 5 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)", justifyContent: "flex-end" },
  modalContent: { maxHeight: "85%", borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
  closeBtn: { padding: 4, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 20 },
  modalForm: { padding: Spacing.xl, gap: Spacing.lg },
  label: { marginBottom: 6, fontWeight: '600' },
  mealTabs: { flexDirection: "row", gap: Spacing.sm },
  mealTab: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.sm, borderWidth: 1, alignItems: "center", justifyContent: 'center' },
  textArea: { height: 120, borderRadius: BorderRadius.sm, padding: Spacing.md, textAlignVertical: "top", fontSize: 16 },
  input: { height: Spacing.inputHeight, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, fontSize: 16 },
  switchContainer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: Spacing.sm },
});
