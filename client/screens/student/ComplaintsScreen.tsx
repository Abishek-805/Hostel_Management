import React, { useState, useEffect } from "react";
import { StyleSheet, View, ScrollView, Pressable, Modal, TextInput, Alert, FlatList, Image, RefreshControl } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
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
import { BrandedLoadingOverlay } from "@/components/BrandedLoadingOverlay";

type ComplaintCategory = "water" | "electricity" | "cleaning" | "food" | "others";
type ComplaintStatus = "submitted" | "in_progress" | "resolved";

const CATEGORY_ICONS: Record<ComplaintCategory, keyof typeof Feather.glyphMap> = {
  water: "droplet",
  electricity: "zap",
  cleaning: "trash-2",
  food: "coffee",
  others: "more-horizontal",
};

const CATEGORY_COLORS: Record<ComplaintCategory, string> = {
  water: "#3B82F6", // Blue
  electricity: "#F59E0B", // Amber
  cleaning: "#8B5CF6", // Violet
  food: "#EF4444", // Red
  others: "#6B7280", // Gray
};

const STATUS_COLORS: Record<ComplaintStatus, string> = {
  submitted: Colors.status.info,
  in_progress: Colors.status.warning,
  resolved: Colors.status.success,
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

export default function ComplaintsScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [selectedCategory, setSelectedCategory] = useState<ComplaintCategory | "all">("all");
  const [showModal, setShowModal] = useState(false);
  const [category, setCategory] = useState<ComplaintCategory>("water");
  const [description, setDescription] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [image, setImage] = useState<string | null>(null);

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled) {
      if (result.assets[0].base64) {
        setImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
      }
    }
  };

  const complaintsQueryKey = ['complaints', 'user', user?.id];

  const { data: complaints, isLoading, refetch } = useQuery({
    queryKey: complaintsQueryKey,
    enabled: !!user?.id,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch])
  );

  const createComplaintMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/complaints", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: complaintsQueryKey });
      queryClient.invalidateQueries({ queryKey: ['/complaints/user', user?.id] });
      setShowModal(false);
      resetForm();
      Alert.alert("Success", "Complaint submitted successfully!");
    },
    onError: () => {
      Alert.alert("Error", "Failed to submit complaint");
    },
  });

  const resetForm = () => {
    setCategory("water");
    setDescription("");
    setIsAnonymous(false);
    setImage(null);
  };

  const handleSubmit = () => {
    if (!description.trim()) {
      Alert.alert("Error", "Please describe your complaint");
      return;
    }
    if (!user?.id) return;

    createComplaintMutation.mutate({
      userId: user.id,
      category,
      description: description.trim(),
      isAnonymous,
      photoUrl: image, // This is now a link (string)
    });
  };

  const filteredComplaints = React.useMemo(() => {
    const all = complaints as any[];
    if (!all) return [];
    if (selectedCategory === "all") return all;
    return all.filter((c) => c.category === selectedCategory);
  }, [complaints, selectedCategory]);

  const categories: (ComplaintCategory | "all")[] = ["all", "water", "electricity", "cleaning", "food", "others"];

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <ThemedView style={styles.container}>
      <FloatingBackground primaryColor={Colors.primary.main} secondaryColor={Colors.secondary.main} />
      {/* Filters */}
      <Animated.View entering={FadeInDown.delay(100)} style={[styles.filterContainer, { paddingTop: headerHeight + Spacing.lg }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {categories.map((cat) => (
            <Pressable
              key={cat}
              style={[
                styles.filterChip,
                {
                  backgroundColor: selectedCategory === cat ? (cat === "all" ? Colors.primary.main : CATEGORY_COLORS[cat]) : theme.backgroundDefault,
                  borderColor: selectedCategory === cat ? (cat === "all" ? Colors.primary.main : CATEGORY_COLORS[cat]) : theme.border,
                },
              ]}
              onPress={() => setSelectedCategory(cat)}
            >
              {cat !== "all" ? (
                <Feather
                  name={CATEGORY_ICONS[cat]}
                  size={16}
                  color={selectedCategory === cat ? "#FFFFFF" : CATEGORY_COLORS[cat]}
                />
              ) : null}
              <ThemedText
                type="bodySmall"
                style={[styles.filterText, { color: selectedCategory === cat ? "#FFFFFF" : theme.text }]}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      </Animated.View>

      <FlatList
        data={filteredComplaints}
        keyExtractor={(item) => item._id || item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary.main} />}
        ListEmptyComponent={() => (
          <Animated.View entering={FadeInDown.delay(200)} style={[styles.emptyState, { backgroundColor: theme.backgroundDefault }]}>
            <Feather name="check-circle" size={48} color={theme.textSecondary} />
            <ThemedText type="body" secondary style={styles.emptyText}>
              No complaints found
            </ThemedText>
          </Animated.View>
        )}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(200 + index * 50)}>
            <View style={[styles.complaintCard, { backgroundColor: theme.backgroundDefault }]}>
              <View style={styles.complaintHeader}>
                <PulsingIcon style={[styles.categoryIcon, { backgroundColor: CATEGORY_COLORS[item.category as ComplaintCategory] + "20" }]}>
                  <Feather name={CATEGORY_ICONS[item.category as ComplaintCategory]} size={20} color={CATEGORY_COLORS[item.category as ComplaintCategory]} />
                </PulsingIcon>
                <View style={styles.complaintInfo}>
                  <ThemedText type="body" style={styles.categoryText}>
                    {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
                  </ThemedText>
                  <ThemedText type="caption" secondary>{formatDate(item.createdAt)}</ThemedText>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status as ComplaintStatus] }]}>
                  <ThemedText type="caption" style={styles.statusText}>
                    {item.status === "in_progress" ? "In Progress" : item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                  </ThemedText>
                </View>
              </View>
              {item.isAnonymous ? (
                <View style={styles.anonymousBadge}>
                  <Feather name="eye-off" size={12} color={theme.textSecondary} />
                  <ThemedText type="caption" secondary>Anonymous</ThemedText>
                </View>
              ) : null}
              <ThemedText type="bodySmall" secondary style={styles.descriptionText}>
                {item.description}
              </ThemedText>
              {!!item.photoUrl && (
                <View style={styles.attachmentContainer}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.xs }}>
                    <Feather name="paperclip" size={14} color={Colors.primary.main} />
                    <ThemedText type="caption" style={{ fontWeight: '600' }}>Attachment Included</ThemedText>
                  </View>
                  <ThemedText type="caption" secondary numberOfLines={1}>
                    {item.photoUrl}
                  </ThemedText>
                  <ThemedText type="caption" style={{ color: Colors.status.info, marginTop: 2 }}>
                    ✓ Admin can view this link
                  </ThemedText>
                </View>
              )}
              {item.adminRemarks ? (
                <View style={[styles.remarksContainer, { backgroundColor: theme.backgroundSecondary }]}>
                  <ThemedText type="caption" secondary>Admin Response:</ThemedText>
                  <ThemedText type="bodySmall">{item.adminRemarks}</ThemedText>
                </View>
              ) : null}
            </View>
          </Animated.View>
        )}
      />

      <Animated.View entering={FadeInDown.delay(500).springify()} style={[styles.fabContainer, { bottom: tabBarHeight + Spacing.xl }]}>
        <Pressable
          style={[styles.fab, { backgroundColor: Colors.primary.main }]}
          onPress={() => setShowModal(true)}
        >
          <Feather name="plus" size={24} color="#FFFFFF" />
        </Pressable>
      </Animated.View>

      <Modal
        visible={showModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowModal(false)}
        accessibilityViewIsModal={true}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundRoot }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="h3">Report an Issue</ThemedText>
              <Pressable onPress={() => setShowModal(false)}>
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>

            <KeyboardAwareScrollViewCompat contentContainerStyle={styles.modalForm}>
              <ThemedText type="bodySmall" secondary style={styles.label}>Category</ThemedText>
              <View style={styles.categoryGrid}>
                {(["water", "electricity", "cleaning", "food", "others"] as ComplaintCategory[]).map((cat) => (
                  <Pressable
                    key={cat}
                    style={[
                      styles.categoryOption,
                      {
                        backgroundColor: category === cat ? CATEGORY_COLORS[cat] : theme.backgroundDefault,
                        borderColor: category === cat ? CATEGORY_COLORS[cat] : theme.border,
                      },
                    ]}
                    onPress={() => setCategory(cat)}
                  >
                    <Feather
                      name={CATEGORY_ICONS[cat]}
                      size={24}
                      color={category === cat ? "#FFFFFF" : CATEGORY_COLORS[cat]}
                    />
                    <ThemedText
                      type="caption"
                      style={{ color: category === cat ? "#FFFFFF" : theme.text }}
                    >
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>

              <ThemedText type="bodySmall" secondary style={styles.label}>Description</ThemedText>
              <TextInput
                style={[styles.textArea, { backgroundColor: theme.backgroundDefault, color: theme.text }]}
                placeholder="Describe the issue in detail..."
                placeholderTextColor={theme.textSecondary}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
              />

              <View style={{ gap: Spacing.xs }}>
                <ThemedText type="bodySmall" secondary style={styles.label}>
                  📎 Attachment Link (Optional)
                </ThemedText>
                <ThemedText type="caption" secondary style={{ marginBottom: Spacing.xs }}>
                  Paste a link to photos or documents (Google Drive, OneDrive, etc.)
                </ThemedText>
                <View style={{ backgroundColor: theme.backgroundDefault, borderColor: image ? Colors.primary.main : theme.border, borderWidth: 1, borderRadius: BorderRadius.md, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, height: 50, marginBottom: Spacing.sm }}>
                  <Feather name="link" size={20} color={image ? Colors.primary.main : theme.textSecondary} />
                  <TextInput
                    style={{ flex: 1, height: 50, color: theme.text, marginLeft: Spacing.sm }}
                    placeholder="https://drive.google.com/... or any link"
                    placeholderTextColor={theme.textSecondary}
                    value={image || ""}
                    onChangeText={setImage}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                </View>
                {!!image && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
                    <Feather name="check-circle" size={14} color={Colors.status.success} />
                    <ThemedText type="caption" style={{ color: Colors.status.success, flex: 1 }}>
                      Link added - Admin will be able to view this
                    </ThemedText>
                    <Pressable onPress={() => setImage(null)}>
                      <Feather name="x-circle" size={18} color={Colors.status.error} />
                    </Pressable>
                  </View>
                )}
              </View>

              <Pressable
                style={styles.anonymousToggle}
                onPress={() => setIsAnonymous(!isAnonymous)}
              >
                <View style={[styles.checkbox, isAnonymous && styles.checkboxChecked]}>
                  {isAnonymous ? <Feather name="check" size={14} color="#FFFFFF" /> : null}
                </View>
                <View style={styles.anonymousInfo}>
                  <ThemedText type="body">Submit Anonymously</ThemedText>
                  <ThemedText type="caption" secondary>Your identity won't be shared with admin</ThemedText>
                </View>
              </Pressable>

              <Button
                onPress={handleSubmit}
                loading={createComplaintMutation.isPending}
                fullWidth
              >
                Submit Complaint
              </Button>
            </KeyboardAwareScrollViewCompat>
          </View>
        </View>
      </Modal>
      <BrandedLoadingOverlay visible={isLoading} message="Fetching complaints..." icon="alert-circle" />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterContainer: {
    paddingHorizontal: Spacing.lg,
  },
  filterScroll: {
    gap: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  filterText: {
    fontWeight: "500",
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
  },
  complaintCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    ...Shadows.card,
  },
  complaintHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  complaintInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  categoryText: {
    fontWeight: "600",
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    color: "#FFFFFF",
    fontSize: 11,
  },
  anonymousBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  descriptionText: {
    marginTop: Spacing.sm,
  },
  remarksContainer: {
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  emptyState: {
    padding: Spacing.xxl,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    marginTop: Spacing.xl,
  },
  emptyText: {
    marginTop: Spacing.md,
  },
  fabContainer: {
    position: "absolute",
    right: Spacing.lg,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    ...Shadows.fab,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    maxHeight: "85%",
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    ...Shadows.modal,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  modalForm: {
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  label: {
    marginBottom: Spacing.sm,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  categoryOption: {
    width: "30%",
    aspectRatio: 1,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
  },
  textArea: {
    height: 120,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    textAlignVertical: "top",
    fontSize: 16,
  },
  anonymousToggle: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.primary.main,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: Colors.primary.main,
  },
  anonymousInfo: {
    flex: 1,
  },
  imagePicker: {
    marginBottom: Spacing.sm,
  },
  imagePlaceholder: {
    height: 120,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
  },
  imagePreviewContainer: {
    height: 120,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  imagePreview: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  editImageOverlay: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 8,
    borderRadius: 20,
  },
  attachmentButton: {
    marginTop: Spacing.sm,
  },
  attachmentPreview: {
    width: "100%",
    height: 150,
    borderRadius: BorderRadius.md,
    resizeMode: "cover",
  },
  attachmentContainer: {
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: BorderRadius.xs,
  },
});
