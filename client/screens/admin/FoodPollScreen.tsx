import React, { useState, useRef, useEffect } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  Alert,
  FlatList,
  Platform,
  Animated as RNAnimated,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { File, Paths } from 'expo-file-system';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Animated, {
  FadeInDown,
  FadeInRight,
  useSharedValue,
  withRepeat,
  withTiming,
  useAnimatedStyle,
  Easing,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { FloatingBackground } from "@/components/FloatingBackground";
import { BrandedLoadingOverlay } from "@/components/BrandedLoadingOverlay";
import { AdminStackParamList } from "@/navigation/AdminTabNavigator";

type NavigationProp = NativeStackNavigationProp<AdminStackParamList>;

interface FoodItem {
  _id: string;
  name: string;
  voteCount: number;
  hasVoted: boolean;
}

interface Poll {
  _id: string;
  title: string;
  description?: string;
  foods: FoodItem[];
  createdAt: string;
  isActive: boolean;
}

export default function FoodPollScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showClosePollConfirm, setShowClosePollConfirm] = useState(false);
  const [showViewMode, setShowViewMode] = useState<"votes" | "percentage">("votes");
  const [pollTitle, setPollTitle] = useState("");
  const [foodInput, setFoodInput] = useState("");
  const [selectedPollId, setSelectedPollId] = useState<string | null>(null);

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedMeal, setSelectedMeal] = useState<string | null>(null);

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const MEAL_OPTIONS = [
    { id: "Morning", label: "Breakfast", icon: "sunrise" as const },
    { id: "Lunch", label: "Lunch", icon: "sun" as const },
    { id: "Night", label: "Dinner", icon: "moon" as const },
  ];

  // Fetch polls
  const { data: polls = [], isLoading, refetch } = useQuery({
    queryKey: ["food-polls"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/food-polls");
      if (!res.ok) throw new Error("Failed to fetch polls");
      return res.json();
    },
  });

  // Fetch single poll details
  const { data: selectedPoll, isLoading: isLoadingPoll } = useQuery({
    queryKey: ["food-poll", selectedPollId],
    queryFn: async () => {
      if (!selectedPollId) return null;
      const res = await apiRequest("GET", `/food-polls/${selectedPollId}`);
      if (!res.ok) throw new Error("Failed to fetch poll");
      return res.json();
    },
    enabled: !!selectedPollId,
  });

  // Vote mutation
  const voteMutation = useMutation({
    mutationFn: async ({
      pollId,
      foodId,
    }: {
      pollId: string;
      foodId: string;
    }) => {
      const res = await apiRequest("POST", `/food-polls/${pollId}/vote`, { foodId });
      if (!res.ok) throw new Error("Failed to vote");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["food-polls"] });
      queryClient.invalidateQueries({ queryKey: ["food-poll", selectedPollId] });
    },
  });

  // Create poll mutation (admin only)
  const createPollMutation = useMutation({
    mutationFn: async (data: { title: string; foods: string[] }) => {
      const res = await apiRequest("POST", "/food-polls", {
        title: data.title,
        foods: data.foods,
      });
      if (!res.ok) throw new Error("Failed to create poll");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["food-polls"] });
      setShowCreateModal(false);
      setPollTitle("");
      setFoodInput("");
      setSelectedDay(null);
      setSelectedMeal(null);
      Alert.alert("Success", "Poll created successfully!");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to create poll");
    },
  });

  // Auto-generate title when day/meal changes
  useEffect(() => {
    if (selectedDay && selectedMeal) {
      const mealObj = MEAL_OPTIONS.find(m => m.id === selectedMeal);
      if (mealObj) {
        setPollTitle(`${selectedDay} ${mealObj.label} Poll`);
      }
    }
  }, [selectedDay, selectedMeal]);

  // Export poll mutation
  const exportPollMutation = useMutation({
    mutationFn: async (pollId: string) => {
      const res = await apiRequest("GET", `/food-polls/${pollId}/export`);
      if (!res.ok) throw new Error("Failed to export poll");

      const blob = await res.blob();

      // Web: Direct browser download
      if (Platform.OS === "web") {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `poll-results-${pollId}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return { success: true, message: "File downloaded" };
      }

      // Mobile: Save to device storage using new SDK 54 File API
      const fileName = `poll-results-${pollId}.xlsx`;

      try {
        // Convert blob to base64
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
            throw new Error("Permission required to save the exported file");
          }

          const uri = await StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            fileName,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          );

          await StorageAccessFramework.writeAsStringAsync(uri, base64, {
            encoding: 'base64',
          });

          Alert.alert("Saved successfully", "Poll results saved.");
        } else if (Platform.OS === 'ios') {
          // iOS: Use share sheet
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(file.uri, {
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              dialogTitle: 'Share Poll Results',
            });
            Alert.alert("Success", "Poll results exported!");
          } else {
            Alert.alert("Success", "File saved to device storage.");
          }
        }

        return { success: true, message: "File saved and shared" };
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : "Failed to save or share file");
      }
    },
    onSuccess: () => {
      if (Platform.OS !== "web") {
        Alert.alert("Success", "Poll results exported successfully!");
      }
    },
    onError: (error: any) => {
      Alert.alert(
        "Export Error",
        error.message || "Failed to export poll results"
      );
    },
  });

  // Close poll mutation (admin only)
  const closePollMutation = useMutation({
    mutationFn: async (pollId: string) => {
      console.log("MUTATION: Closing poll:", pollId);
      console.log("MUTATION: Making DELETE request to: /food-polls/${pollId}");

      try {
        const res = await apiRequest("DELETE", `/food-polls/${pollId}`);
        console.log("MUTATION: Got response, status:", res.status, "ok:", res.ok);

        if (!res.ok) {
          const errorText = await res.text();
          console.error("MUTATION: Error response text:", errorText);
          throw new Error(`Failed to close poll: ${res.status} - ${errorText}`);
        }

        const data = await res.json();
        console.log("MUTATION: Successfully parsed response:", data);
        return data;
      } catch (err: any) {
        console.error("MUTATION: Exception caught:", err.message);
        throw err;
      }
    },
    onSuccess: (closedPoll) => {
      console.log("SUCCESS: Poll closed, invalidating queries");
      // Invalidate poll queries
      queryClient.invalidateQueries({ queryKey: ["food-polls"] });
      queryClient.invalidateQueries({ queryKey: ["food-poll", selectedPollId] });
      // Also invalidate announcements since the announcement was deleted when poll closed
      queryClient.invalidateQueries({ queryKey: ["announcements"] });

      // Clear selection after a brief delay to ensure UI updates
      setTimeout(() => {
        setSelectedPollId(null);
        Alert.alert("Success", "Poll closed successfully!");
      }, 500);
    },
    onError: (error: any) => {
      console.error("ERROR: Close poll failed:", error);
      const errorMsg = error?.message || "Failed to close poll";
      console.error("ERROR: Showing alert with message:", errorMsg);
      Alert.alert(
        "Error Closing Poll",
        errorMsg
      );
    },
  });

  const handleCreatePoll = () => {
    if (!pollTitle.trim()) {
      Alert.alert("Error", "Please enter a poll title");
      return;
    }

    const foods = foodInput
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);

    if (foods.length === 0) {
      Alert.alert("Error", "Please add at least one food item");
      return;
    }

    createPollMutation.mutate({ title: pollTitle, foods });
  };

  const handleClosePoll = () => {
    console.log("handleClosePoll called");
    console.log("selectedPollId:", selectedPollId);
    console.log("selectedPoll?.isActive:", selectedPoll?.isActive);

    if (!selectedPollId) {
      console.log("No selectedPollId, returning");
      return;
    }

    console.log("Showing confirmation");

    // Use browser confirm on web, Alert on native
    if (Platform.OS === "web") {
      const confirmed = window.confirm(
        "Are you sure you want to close this poll? Students will no longer be able to vote."
      );
      if (confirmed) {
        console.log("User confirmed, calling mutation");
        closePollMutation.mutate(selectedPollId);
      } else {
        console.log("User cancelled");
      }
    } else {
      // Use Modal for native platforms
      setShowClosePollConfirm(true);
    }
  };

  const handleConfirmClosePoll = () => {
    console.log("HANDLER: handleConfirmClosePoll called");
    console.log("HANDLER: selectedPollId is:", selectedPollId);
    console.log("HANDLER: closePollMutation.isPending is:", closePollMutation.isPending);
    setShowClosePollConfirm(false);
    if (selectedPollId) {
      console.log("HANDLER: Calling mutation with pollId:", selectedPollId);
      closePollMutation.mutate(selectedPollId);
      console.log("HANDLER: Mutation called successfully");
    } else {
      console.error("HANDLER: ERROR - selectedPollId is null!");
    }
  };

  const handleCancelClosePoll = () => {
    console.log("handleCancelClosePoll called");
    setShowClosePollConfirm(false);
  };

  const handleVote = (foodId: string) => {
    if (!selectedPollId) return;
    voteMutation.mutate({ pollId: selectedPollId, foodId });
  };

  const handleExport = () => {
    if (!selectedPollId) return;
    exportPollMutation.mutate(selectedPollId);
  };

  const renderPollItem = (poll: Poll, index: number) => {
    const totalVotes = poll.foods.reduce((sum, f) => sum + f.voteCount, 0);
    const topFood = poll.foods[0];

    return (
      <Animated.View
        key={poll._id}
        entering={FadeInDown.delay(index * 100).springify()}
        style={[styles.pollCard, { backgroundColor: theme.backgroundDefault }]}
      >
        <Pressable
          onPress={() => setSelectedPollId(poll._id)}
          style={{ flex: 1 }}
        >
          <View style={styles.pollHeader}>
            <View style={{ flex: 1 }}>
              <ThemedText type="body" style={{ fontWeight: "600" }}>
                {poll.title}
              </ThemedText>
              <ThemedText type="caption" secondary>
                {poll.foods.length} options • {totalVotes} votes
              </ThemedText>
            </View>
            {!poll.isActive && (
              <View
                style={[
                  styles.closedBadge,
                  { backgroundColor: Colors.status.error + "20" },
                ]}
              >
                <ThemedText
                  type="caption"
                  style={{ color: Colors.status.error, fontWeight: "600" }}
                >
                  CLOSED
                </ThemedText>
              </View>
            )}
          </View>

          {topFood && (
            <View style={styles.pollPreview}>
              <View style={styles.previewItem}>
                <Feather
                  name="star"
                  size={16}
                  color={Colors.primary.main}
                  style={{ marginRight: 8 }}
                />
                <ThemedText type="bodySmall">{topFood.name}</ThemedText>
              </View>
              <ThemedText type="caption" secondary>
                {topFood.voteCount} votes
              </ThemedText>
            </View>
          )}

          <Pressable
            onPress={() => setSelectedPollId(poll._id)}
            style={[
              styles.viewButton,
              { backgroundColor: Colors.primary.main + "20" },
            ]}
          >
            <ThemedText
              type="caption"
              style={{ color: Colors.primary.main, fontWeight: "600" }}
            >
              View Results
            </ThemedText>
            <Feather
              name="chevron-right"
              size={14}
              color={Colors.primary.main}
            />
          </Pressable>
        </Pressable>
      </Animated.View>
    );
  };

  if (selectedPollId && (selectedPoll || isLoadingPoll)) {
    if (isLoadingPoll || !selectedPoll) {
      return (
        <ThemedView style={styles.container}>
          <FloatingBackground
            primaryColor={Colors.secondary.main}
            secondaryColor={Colors.primary.main}
          />
          <View
            style={[
              styles.headerBg,
              { backgroundColor: theme.backgroundSecondary, opacity: 0.5 },
            ]}
          />
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingTop: headerHeight + Spacing.lg,
                paddingBottom: tabBarHeight + 100,
                justifyContent: "center",
              },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <BrandedLoadingOverlay
              visible={true}
              message="Loading poll details..."
              icon="bar-chart-2"
              color={Colors.primary.main}
            />
          </ScrollView>
        </ThemedView>
      );
    }

    const totalVotes = selectedPoll.foods.reduce(
      (sum: number, f: FoodItem) => sum + f.voteCount,
      0
    );
    const sortedFoods = [...selectedPoll.foods].sort(
      (a, b) => b.voteCount - a.voteCount
    );

    return (
      <ThemedView style={styles.container}>
        <FloatingBackground
          primaryColor={Colors.secondary.main}
          secondaryColor={Colors.primary.main}
        />
        <View
          style={[
            styles.headerBg,
            { backgroundColor: theme.backgroundSecondary, opacity: 0.5 },
          ]}
        />

        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: headerHeight + Spacing.lg,
              paddingBottom: tabBarHeight + 100,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Back Button */}
          <Pressable
            onPress={() => {
              if (selectedPollId) {
                setSelectedPollId(null);
              } else {
                navigation.goBack();
              }
            }}
            style={styles.backButton}
          >
            <Feather name="chevron-left" size={24} color={theme.text} />
            <ThemedText type="body">Back</ThemedText>
          </Pressable>

          {/* Poll Title */}
          <Animated.View entering={FadeInDown.delay(100).springify()}>
            <ThemedText type="h2" style={{ marginBottom: Spacing.md }}>
              {selectedPoll.title}
            </ThemedText>
          </Animated.View>

          {/* View Mode Toggle */}
          <View style={styles.modeToggle}>
            <Pressable
              style={[
                styles.modeButton,
                showViewMode === "votes" && {
                  backgroundColor: Colors.primary.main,
                },
              ]}
              onPress={() => setShowViewMode("votes")}
            >
              <ThemedText
                type="caption"
                style={{
                  color:
                    showViewMode === "votes" ? "#FFFFFF" : theme.textSecondary,
                  fontWeight: "600",
                }}
              >
                Vote Count
              </ThemedText>
            </Pressable>
            <Pressable
              style={[
                styles.modeButton,
                showViewMode === "percentage" && {
                  backgroundColor: Colors.primary.main,
                },
              ]}
              onPress={() => setShowViewMode("percentage")}
            >
              <ThemedText
                type="caption"
                style={{
                  color:
                    showViewMode === "percentage"
                      ? "#FFFFFF"
                      : theme.textSecondary,
                  fontWeight: "600",
                }}
              >
                Percentage
              </ThemedText>
            </Pressable>
          </View>

          {/* Results */}
          <View style={{ gap: Spacing.md, marginTop: Spacing.lg, marginHorizontal: -Spacing.sm }}>
            {sortedFoods.map((food, index) => {
              const percentage =
                totalVotes > 0 ? ((food.voteCount / totalVotes) * 100).toFixed(1) : "0";
              const displayValue =
                showViewMode === "votes" ? food.voteCount : `${percentage}%`;

              return (
                <Animated.View
                  key={food._id}
                  entering={FadeInRight.delay(index * 80).springify()}
                  style={[
                    styles.foodResultCard,
                    { backgroundColor: theme.backgroundDefault },
                  ]}
                >
                  <Pressable
                    style={styles.foodResultContent}
                    onPress={() =>
                      selectedPoll.isActive && handleVote(food._id)
                    }
                    disabled={!selectedPoll.isActive}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        flex: 1,
                        gap: Spacing.md,
                      }}
                    >
                      <View
                        style={[
                          styles.rankBadge,
                          {
                            backgroundColor:
                              index === 0
                                ? Colors.status.success
                                : index === 1
                                  ? Colors.status.warning
                                  : Colors.primary.main,
                          },
                        ]}
                      >
                        <ThemedText
                          type="caption"
                          style={{ color: "#FFFFFF", fontWeight: "700" }}
                        >
                          #{index + 1}
                        </ThemedText>
                      </View>

                      <View style={{ flex: 1 }}>
                        <ThemedText type="body" style={{ fontWeight: "600" }}>
                          {food.name}
                        </ThemedText>
                        <View
                          style={[
                            styles.progressBar,
                            { backgroundColor: theme.border },
                          ]}
                        >
                          <View
                            style={[
                              styles.progressFill,
                              {
                                width: `${percentage}%` as any,
                                backgroundColor: (food as any).hasVoted
                                  ? Colors.primary.main
                                  : Colors.secondary.main,
                              },
                            ]}
                          />
                        </View>
                      </View>

                      <View style={styles.voteDisplay}>
                        <ThemedText
                          type="h3"
                          style={{ fontWeight: "700", textAlign: "right" }}
                        >
                          {displayValue}
                        </ThemedText>
                        {food.hasVoted && (
                          <View
                            style={[
                              styles.votedIndicator,
                              {
                                backgroundColor: Colors.primary.main + "20",
                              },
                            ]}
                          >
                            <Feather
                              name="check"
                              size={14}
                              color={Colors.primary.main}
                            />
                          </View>
                        )}
                      </View>
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>

          {/* Export Button */}
          {user?.role === "admin" && (
            <Animated.View entering={FadeInDown.delay(200).springify()} style={{ gap: Spacing.md }}>
              <Button
                onPress={handleExport}
                loading={exportPollMutation.isPending}
                style={{ marginTop: Spacing.xl }}
              >
                <Feather
                  name="download"
                  size={18}
                  color="#FFFFFF"
                  style={{ marginRight: 8 }}
                />
                Export Results as Excel
              </Button>

              {selectedPoll?.isActive && (
                <Pressable
                  onPress={handleClosePoll}
                  disabled={closePollMutation.isPending}
                  style={({ pressed }) => [
                    {
                      backgroundColor: Colors.status.error,
                      borderRadius: BorderRadius.md,
                      paddingVertical: Spacing.md,
                      paddingHorizontal: Spacing.lg,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: Spacing.sm,
                      opacity: pressed ? 0.8 : closePollMutation.isPending ? 0.6 : 1,
                    }
                  ]}
                >
                  <Feather
                    name="x-circle"
                    size={18}
                    color="#FFFFFF"
                  />
                  <ThemedText type="body" style={{ color: "#FFFFFF", fontWeight: "600" }}>
                    {closePollMutation.isPending ? "Closing..." : "Close Poll"}
                  </ThemedText>
                </Pressable>
              )}
            </Animated.View>
          )}
        </ScrollView>

        <BrandedLoadingOverlay
          visible={voteMutation.isPending || exportPollMutation.isPending || closePollMutation.isPending}
          message={
            voteMutation.isPending ? "Recording vote..." :
              exportPollMutation.isPending ? "Exporting results..." :
                closePollMutation.isPending ? "Closing poll..." :
                  ""
          }
          icon="bar-chart-2"
          color={Colors.primary.main}
        />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FloatingBackground
        primaryColor={Colors.secondary.main}
        secondaryColor={Colors.primary.main}
      />
      <View
        style={[
          styles.headerBg,
          { backgroundColor: theme.backgroundSecondary, opacity: 0.5 },
        ]}
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: headerHeight + Spacing.lg,
            paddingBottom: tabBarHeight + 100,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <ThemedText type="h2" style={{ marginBottom: Spacing.sm }}>
            Food Poll
          </ThemedText>
          <ThemedText type="body" secondary>
            Vote for your favorite dishes in the mess menu
          </ThemedText>
        </Animated.View>

        <View style={{ height: Spacing.lg }} />

        {/* Active Polls */}
        {Array.isArray(polls) && polls.length > 0 ? (
          <View>
            <ThemedText type="h3" style={styles.sectionTitle}>
              Active Polls ({polls.filter((p: Poll) => p.isActive).length})
            </ThemedText>
            {polls
              .filter((p: Poll) => p.isActive)
              .map((poll: Poll, index: number) => renderPollItem(poll, index))}
          </View>
        ) : (
          <Animated.View
            entering={FadeInDown.delay(200)}
            style={[
              styles.emptyState,
              { backgroundColor: theme.backgroundDefault },
            ]}
          >
            <Feather
              name="bar-chart-2"
              size={48}
              color={theme.textSecondary}
            />
            <ThemedText type="body" secondary style={styles.emptyText}>
              No active polls yet
            </ThemedText>
            {user?.role === "admin" && (
              <Button
                variant="outline"
                onPress={() => setShowCreateModal(true)}
                style={{ marginTop: Spacing.md }}
              >
                Create First Poll
              </Button>
            )}
          </Animated.View>
        )}

        {/* Closed Polls */}
        {Array.isArray(polls) && polls.filter((p: Poll) => !p.isActive).length > 0 && (
          <View style={{ marginTop: Spacing.xl }}>
            <ThemedText type="h3" style={styles.sectionTitle}>
              Closed Polls
            </ThemedText>
            {polls
              .filter((p: Poll) => !p.isActive)
              .map((poll: Poll, index: number) => renderPollItem(poll, index))}
          </View>
        )}
      </ScrollView>

      {/* Admin FAB */}
      {user?.role === "admin" && (
        <Pressable
          style={[styles.fab, { backgroundColor: Colors.primary.main }]}
          onPress={() => setShowCreateModal(true)}
        >
          <Feather name="plus" size={24} color="#FFFFFF" />
        </Pressable>
      )}

      {/* Create Poll Modal */}
      {user?.role === "admin" && (
        <Modal
          visible={showCreateModal}
          animationType="slide"
          transparent

          onRequestClose={() => {
            setShowCreateModal(false);
            setPollTitle("");
            setFoodInput("");
            setSelectedDay(null);
            setSelectedMeal(null);
          }}
          accessibilityViewIsModal={true}
        >
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalContent,
                { backgroundColor: theme.backgroundRoot },
              ]}
            >
              <View style={styles.modalHeader}>
                <ThemedText type="h3">Create Food Poll</ThemedText>
                <Pressable
                  onPress={() => {
                    setShowCreateModal(false);
                    setPollTitle("");
                    setFoodInput("");
                    setSelectedDay(null);
                    setSelectedMeal(null);
                  }}
                  style={styles.closeBtn}
                >
                  <Feather name="x" size={24} color={theme.text} />
                </Pressable>
              </View>

              <KeyboardAwareScrollViewCompat
                contentContainerStyle={styles.modalForm}
              >
                {/* Week Day Tabs */}
                <View>
                  <ThemedText type="bodySmall" secondary style={[styles.label, { marginBottom: 12 }]}>
                    Select Day
                  </ThemedText>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 12, paddingRight: Spacing.xl }}
                  >
                    {DAYS.map((day) => {
                      const isSelected = selectedDay === day;
                      return (
                        <Pressable
                          key={day}
                          onPress={() => setSelectedDay(day)}
                          style={[
                            styles.dayCard,
                            isSelected && styles.dayCardSelected
                          ]}
                        >
                          <ThemedText
                            type="body"
                            style={{
                              color: isSelected ? "#FFFFFF" : theme.text,
                              opacity: isSelected ? 1 : 0.7,
                              fontWeight: isSelected ? "700" : "500"
                            }}
                          >
                            {day}
                          </ThemedText>
                          {isSelected && <View style={styles.dayDot} />}
                        </Pressable>
                      )
                    })}
                  </ScrollView>
                </View>

                {/* Meal Tabs - Show only after Day is selected */}
                {selectedDay && (
                  <Animated.View entering={FadeInDown.duration(200)}>
                    <ThemedText type="bodySmall" secondary style={[styles.label, { marginBottom: 12 }]}>
                      Select Meal
                    </ThemedText>
                    <View style={{ flexDirection: "row", gap: 12 }}>
                      {MEAL_OPTIONS.map((meal) => {
                        const isSelected = selectedMeal === meal.id;
                        return (
                          <Pressable
                            key={meal.id}
                            onPress={() => setSelectedMeal(meal.id)}
                            style={[
                              styles.mealButton,
                              isSelected && styles.mealButtonSelected,
                              { backgroundColor: isSelected ? Colors.primary.main : theme.backgroundDefault }
                            ]}
                          >
                            <Feather
                              name={meal.icon}
                              size={18}
                              color={isSelected ? "#FFFFFF" : theme.text}
                            />
                            <ThemedText
                              type="bodySmall"
                              style={{
                                fontWeight: "600",
                                color: isSelected ? "#FFFFFF" : theme.text
                              }}
                            >
                              {meal.label}
                            </ThemedText>
                          </Pressable>
                        )
                      })}
                    </View>
                  </Animated.View>
                )}

                {/* Form Inputs - Show only after Meal is selected */}
                {selectedMeal && (
                  <Animated.View entering={FadeInDown.springify()} style={{ gap: Spacing.lg }}>
                    <View>
                      <ThemedText type="bodySmall" secondary style={styles.label}>
                        Poll Title
                      </ThemedText>
                      <TextInput
                        style={[
                          styles.input,
                          {
                            backgroundColor: theme.backgroundDefault,
                            color: theme.text,
                            borderColor: theme.border,
                          },
                        ]}
                        placeholder="e.g., What's your favorite dish?"
                        placeholderTextColor={theme.textSecondary}
                        value={pollTitle}
                        onChangeText={setPollTitle}
                      />
                    </View>

                    <View>
                      <ThemedText type="bodySmall" secondary style={styles.label}>
                        Food Items (one per line)
                      </ThemedText>
                      <TextInput
                        style={[
                          styles.textArea,
                          {
                            backgroundColor: theme.backgroundDefault,
                            color: theme.text,
                            borderColor: theme.border,
                          },
                        ]}
                        placeholder="e.g.&#10;Paneer Butter Masala&#10;Biryani&#10;Sambar Rice"
                        placeholderTextColor={theme.textSecondary}
                        value={foodInput}
                        onChangeText={setFoodInput}
                        multiline
                        numberOfLines={6}
                      />
                    </View>
                  </Animated.View>
                )}

                {selectedMeal && (
                  <Button
                    onPress={handleCreatePoll}
                    loading={createPollMutation.isPending}
                    fullWidth
                  >
                    Create Poll
                  </Button>
                )}
              </KeyboardAwareScrollViewCompat>
            </View>
          </View>
        </Modal>
      )}

      {/* Close Poll Confirmation Modal */}
      <Modal
        visible={showClosePollConfirm}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCancelClosePoll}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.backgroundDefault, width: "80%", maxWidth: 400 },
            ]}
          >
            <ThemedText type="h3" style={{ marginBottom: Spacing.md, fontWeight: "600" }}>
              Close Poll?
            </ThemedText>
            <ThemedText type="body" secondary style={{ marginBottom: Spacing.lg }}>
              Are you sure you want to close this poll? Students will no longer be able to vote.
            </ThemedText>

            <View style={{ flexDirection: "row", gap: Spacing.md }}>
              <Pressable
                onPress={() => {
                  console.log("Cancel button pressed");
                  handleCancelClosePoll();
                }}
                style={({ pressed }) => [
                  {
                    flex: 1,
                    paddingVertical: Spacing.md,
                    borderRadius: BorderRadius.md,
                    opacity: pressed ? 0.7 : 1,
                  },
                  { backgroundColor: theme.border },
                ]}
              >
                <ThemedText type="body" style={{ textAlign: "center", fontWeight: "600" }}>
                  Cancel
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={() => {
                  console.log("Close Poll button pressed in modal");
                  handleConfirmClosePoll();
                }}
                disabled={closePollMutation.isPending}
                style={({ pressed }) => [
                  {
                    flex: 1,
                    paddingVertical: Spacing.md,
                    borderRadius: BorderRadius.md,
                    opacity: pressed ? 0.8 : closePollMutation.isPending ? 0.6 : 1,
                  },
                  {
                    backgroundColor: Colors.status.error,
                  },
                ]}
              >
                <ThemedText type="body" style={{ textAlign: "center", color: "#FFFFFF", fontWeight: "600" }}>
                  {closePollMutation.isPending ? "Closing..." : "Close Poll"}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <BrandedLoadingOverlay
        visible={isLoading || createPollMutation.isPending}
        message={
          isLoading
            ? "Loading polls..."
            : "Creating poll..."
        }
        icon="bar-chart-2"
        color={Colors.primary.main}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBg: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginHorizontal: -Spacing.md,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
    fontWeight: "700",
  },
  pollCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    marginHorizontal: Spacing.sm,
    ...Shadows.card,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  pollHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  closedBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  pollPreview: {
    marginVertical: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary.main,
    backgroundColor: "rgba(0,0,0,0.02)",
    borderRadius: BorderRadius.sm,
  },
  previewItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  viewButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.sm,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.primary.main + "40",
  },
  emptyState: {
    padding: Spacing.xxl,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    marginTop: Spacing.lg,
    marginHorizontal: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  emptyText: {
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  modeToggle: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
    marginHorizontal: Spacing.sm,
  },
  modeButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.05)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  foodResultCard: {
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.sm,
    ...Shadows.card,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  foodResultContent: {
    padding: Spacing.md,
  },
  rankBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  progressBar: {
    height: 10,
    borderRadius: 5,
    marginTop: Spacing.xs,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  progressFill: {
    height: "100%",
    borderRadius: 5,
  },
  voteDisplay: {
    alignItems: "flex-end",
    minWidth: 50,
  },
  votedIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing.xs,
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
    elevation: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "flex-end",
    alignItems: "stretch",
  },
  modalContent: {
    maxHeight: "85%",
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    backgroundColor: "white",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  closeBtn: {
    padding: 4,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 20,
  },
  modalForm: { padding: Spacing.xl, gap: Spacing.lg },
  label: { marginBottom: 6, fontWeight: "600" },
  input: {
    height: Spacing.inputHeight,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
    borderWidth: 1,
  },
  textArea: {
    height: 140,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    textAlignVertical: "top",
    fontSize: 16,
    borderWidth: 1,
  },
  dayCard: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.lg,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.15)",
  },
  dayCardSelected: {
    backgroundColor: Colors.primary.main,
    borderColor: Colors.primary.main,
    ...Shadows.md,
  },
  dayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#FFFFFF",
    marginTop: 6,
  },
  mealButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.15)",
    backgroundColor: "transparent",
  },
  mealButtonSelected: {
    backgroundColor: Colors.primary.main,
    borderColor: Colors.primary.main,
    ...Shadows.sm,
  },
});
