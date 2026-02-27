import React, { useState, useRef, useEffect } from "react";
import { StyleSheet, View, ScrollView, Pressable, Modal, TextInput, Alert, FlatList, Image, Animated as RNAnimated } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeInRight, useSharedValue, withRepeat, withTiming, useAnimatedStyle, Easing } from 'react-native-reanimated';

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { FloatingBackground } from "@/components/FloatingBackground";
import { LoadingOverlay } from "@/components/LoadingOverlay";

type MealType = "breakfast" | "lunch" | "dinner";

const MEAL_ICONS: Record<MealType, keyof typeof Feather.glyphMap> = {
  breakfast: "sunrise",
  lunch: "sun",
  dinner: "moon",
};

const DAYS_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const DAYS_FULL: Record<string, string> = {
  'sun': 'Sunday', 'mon': 'Monday', 'tue': 'Tuesday', 'wed': 'Wednesday',
  'thu': 'Thursday', 'fri': 'Friday', 'sat': 'Saturday'
};

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
          useNativeDriver: false
        }),
        RNAnimated.timing(opacity, {
          toValue: minOpacity,
          duration: duration / 2,
          useNativeDriver: false
        }),
      ])
    );

    animation.start();

    return () => animation.stop();
  }, [duration, minOpacity, maxOpacity]);

  return <RNAnimated.View style={[styles.dot, { backgroundColor: color, opacity }]} />;
};

export default function MenuScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedMeal, setSelectedMeal] = useState<MealType>("breakfast");
  const [selectedDay, setSelectedDay] = useState<typeof DAYS_SHORT[number]>(DAYS_SHORT[new Date().getDay()]);

  // LIVE CLOCK State
  const [currentTime, setCurrentTime] = useState(new Date());

  // Timer to update status every minute
  useEffect(() => {
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

    let config = {
      duration: 2000,
      minOpacity: 0.4,
      maxOpacity: 0.8,
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
      config.duration = 400;
      config.minOpacity = 0.6;
      config.maxOpacity = 1.0;
    }

    return { ...config, label };
  };

  const breakfastState = getMealState("breakfast");
  const lunchState = getMealState("lunch");
  const dinnerState = getMealState("dinner");

  const { data: menuData } = useQuery({
    queryKey: [
      "mess-menus",
      `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}?hostelBlock=${user?.hostelBlock || ''}`,
    ],
    enabled: !!user?.hostelBlock,
  });

  const isLoading = !menuData;

  const getDates = () => {
    const dates = [];
    for (let i = -1; i <= 12; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const formatDate = (date: Date) => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return {
      day: days[date.getDay()],
      date: date.getDate(),
      isToday: date.toDateString() === new Date().toDateString(),
    };
  };

  const getCurrentMealMenu = () => {
    const menus = menuData as any[];
    if (!menus) return null;
    return menus.find((m) => m.mealType === selectedMeal);
  };

  const currentMenu = getCurrentMealMenu();

  const handleSubmitSuggestion = () => {
    console.log('Submit suggestion clicked');
    console.log('Dish name:', dishName);
    console.log('User:', user);

    if (!dishName.trim()) {
      Alert.alert("Error", "Please enter a dish name");
      return;
    }
    if (!user?.id || !user?.hostelBlock) {
      Alert.alert("Error", "You must be logged in and assigned to a hostel");
      return;
    }

    const suggestionData = {
      userId: user.id,
      dishName: dishName.trim(),
      description: dishDescription.trim() || undefined,
      hostelBlock: user.hostelBlock,
      dayOfWeek: selectedDay,
      category: selectedMeal,
      // Sending defaults for non-interactive fields
      type: 'veg',
      frequency: 'trial'
    };

    console.log('Submitting suggestion:', suggestionData);
    createSuggestionMutation.mutate(suggestionData);
  };

  return (
    <ThemedView style={styles.container}>
      <FloatingBackground primaryColor={Colors.primary.main} secondaryColor={Colors.secondary.main} />
      {/* Background Header */}
      <View style={[styles.headerBg, { backgroundColor: theme.backgroundSecondary }]} />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerHeight + Spacing.lg, paddingBottom: tabBarHeight + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
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
                <Pressable
                  style={[
                    styles.dateItem,
                    { backgroundColor: isSelected ? Colors.primary.main : theme.backgroundDefault },
                  ]}
                  onPress={() => setSelectedDate(item)}
                >
                  <ThemedText
                    type="caption"
                    style={[styles.dateDay, { color: isSelected ? "#FFFFFF" : theme.textSecondary }]}
                  >
                    {day}
                  </ThemedText>
                  <ThemedText
                    type="h3"
                    style={{ color: isSelected ? "#FFFFFF" : theme.text }}
                  >
                    {date}
                  </ThemedText>
                  {isToday ? (
                    <View style={[styles.todayDot, { backgroundColor: isSelected ? "#FFFFFF" : Colors.primary.main }]} />
                  ) : null}
                </Pressable>
              </Animated.View>
            );
          }}
        />

        <View style={styles.mealTabs}>
          {(["breakfast", "lunch", "dinner"] as MealType[]).map((meal) => (
            <Pressable
              key={meal}
              style={[
                styles.mealTab,
                {
                  backgroundColor: selectedMeal === meal ? Colors.primary.main : theme.backgroundDefault,
                  borderColor: selectedMeal === meal ? Colors.primary.main : theme.border,
                },
              ]}
              onPress={() => setSelectedMeal(meal)}
            >
              <Feather
                name={MEAL_ICONS[meal]}
                size={20}
                color={selectedMeal === meal ? "#FFFFFF" : theme.text}
              />
              <ThemedText
                type="bodySmall"
                style={[styles.mealTabText, { color: selectedMeal === meal ? "#FFFFFF" : theme.text }]}
              >
                {meal.charAt(0).toUpperCase() + meal.slice(1)}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        <Animated.View entering={FadeInDown.delay(200).springify()} style={[styles.menuCard, { backgroundColor: theme.backgroundDefault }]}>
          {currentMenu ? (
            <>
              <View style={styles.menuHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                  <PulsingIcon style={[styles.mealIcon, { backgroundColor: Colors.primary.light + '20' }]}>
                    <Feather name={MEAL_ICONS[selectedMeal]} size={20} color={Colors.primary.main} />
                  </PulsingIcon>
                  <View>
                    <ThemedText type="h3">Today's {selectedMeal.charAt(0).toUpperCase() + selectedMeal.slice(1)}</ThemedText>
                    <ThemedText type="caption" secondary>
                      {selectedMeal === 'breakfast' ? '07:30 AM - 09:00 AM' : selectedMeal === 'lunch' ? '12:30 PM - 02:00 PM' : '07:30 PM - 09:00 PM'}
                    </ThemedText>
                  </View>
                </View>

                {currentMenu.isSpecial ? (
                  <View style={styles.specialBadge}>
                    <BlinkingDot color="#fff" duration={600} />
                    <ThemedText type="caption" style={styles.specialText}>SPECIAL</ThemedText>
                  </View>
                ) : null}
              </View>

              <View style={[styles.divider, { backgroundColor: theme.border }]} />

              {currentMenu.specialNote ? (
                <View style={[styles.noteBox, { backgroundColor: Colors.status.warning + '10' }]}>
                  <Feather name="info" size={14} color={Colors.status.warning} />
                  <ThemedText type="caption" style={{ color: Colors.status.warning }}>{currentMenu.specialNote}</ThemedText>
                </View>
              ) : null}

              <View style={styles.menuItems}>
                {currentMenu.menuItems && currentMenu.menuItems.length > 0 ? (
                  currentMenu.menuItems.map((item: any, index: number) => (
                    <View key={`item-${index}-${item.name}`} style={[styles.menuItemCard, { borderBottomColor: theme.border }]}>
                      <View style={styles.menuItemContent}>
                        <ThemedText type="body" style={styles.menuItemName}>•  {item.name}</ThemedText>
                      </View>
                    </View>
                  ))
                ) : (
                  <ThemedText type="body" style={{ lineHeight: 24, padding: Spacing.md }}>
                    {currentMenu.items}
                  </ThemedText>
                )}
              </View>
            </>
          ) : (
            <View style={styles.noMenuState}>
              <Feather name="coffee" size={48} color={theme.textSecondary} />
              <ThemedText type="body" secondary style={styles.noMenuText}>
                No menu available for this date
              </ThemedText>
            </View>
          )}
        </Animated.View>

        {/* Food Poll Section */}
        <Animated.View entering={FadeInDown.delay(200).springify()} style={{ marginTop: Spacing.xl }}>
          <Pressable
            style={[
              styles.pollCard, 
              { 
                backgroundColor: theme.backgroundDefault,
                borderWidth: 2,
                borderColor: Colors.primary.main,
                shadowColor: Colors.primary.main,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 8,
                elevation: 8,
              }
            ]}
            onPress={() => navigation.navigate("FoodPoll")}
          >
            <View style={[styles.pollIcon, { backgroundColor: Colors.primary.main + "25" }]}>
              <Feather name="bar-chart-2" size={28} color={Colors.primary.main} />
            </View>
            <View style={styles.pollContent}>
              <ThemedText type="body" style={{ fontWeight: "700", fontSize: 16 }}>Food Poll</ThemedText>
              <ThemedText type="caption" secondary style={{ fontSize: 12, marginTop: 2 }}>Vote on your favorite dishes</ThemedText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
              <View style={{ width: 2, height: 20, backgroundColor: Colors.primary.main, borderRadius: 1 }} />
              <Feather name="chevron-right" size={22} color={Colors.primary.main} />
            </View>
          </Pressable>
        </Animated.View>
      </ScrollView>

      <LoadingOverlay visible={isLoading} message="Fetching today's menu..." icon="coffee" />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  statusDashboard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    ...Shadows.card,
  },
  statusRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statusBox: {
    flex: 1,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dateScroller: {
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  dateItem: {
    width: 60,
    height: 85,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    ...Shadows.card,
  },
  dateDay: {
    marginBottom: Spacing.xs,
    fontWeight: '600',
  },
  todayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: Spacing.xs,
  },
  mealTabs: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  mealTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  mealTabText: {
    fontWeight: "500",
  },
  menuCard: {
    padding: 0,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xxl,
    ...Shadows.card,
    overflow: 'hidden',
  },
  menuHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.md,
  },
  mealIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  specialBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.status.warning,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
  },
  specialText: {
    color: "#FFFFFF",
    fontWeight: 'bold',
    fontSize: 10,
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: Spacing.md,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  divider: {
    height: 1,
    opacity: 0.5,
  },
  menuItems: {
    padding: Spacing.md,
    paddingTop: 0,
    gap: Spacing.md,
  },
  menuItemCard: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemName: {
    fontWeight: "600",
  },
  noMenuState: {
    alignItems: "center",
    paddingVertical: Spacing.xxl,
  },
  noMenuText: {
    marginTop: Spacing.md,
  },
  sectionTitle: {
    marginBottom: Spacing.xs,
  },
  sectionSubtitle: {
    marginBottom: Spacing.lg,
  },
  suggestionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
    ...Shadows.card,
  },
  suggestionContent: {
    flex: 1,
  },
  suggestionName: {
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  voteButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.xs,
    gap: Spacing.xs,
  },
  emptyState: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
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
  pollCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginHorizontal: 0,
    ...Shadows.card,
    borderWidth: 2,
    borderColor: Colors.primary.main,
  },
  pollIcon: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.lg,
  },
  pollContent: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    padding: Spacing.xl,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  modalForm: {
    gap: Spacing.sm
  },
  input: {
    height: Spacing.inputHeight,
    borderRadius: BorderRadius.xs,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'transparent'
  },
  label: {
    marginBottom: Spacing.xs,
    marginLeft: Spacing.xs
  },
  dateCard: {
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
  },
  textArea: {
    height: 100,
    paddingTop: Spacing.md,
    textAlignVertical: "top",
  },
});
